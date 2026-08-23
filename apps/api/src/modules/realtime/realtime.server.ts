import type { Server as HttpServer } from 'node:http';

import type {
  ClientToServerEvents,
  RealtimeAck,
  ServerToClientEvents,
} from '@skillbridge/contracts';
import type { DatabasePool } from '@skillbridge/database';
import { Server } from 'socket.io';
import { ZodError } from 'zod';

import { ApiError } from '../../shared/http/api-error.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { TokenService } from '../auth/token.service.js';
import type { DomainEventBus } from '../domain/domain.events.js';
import { messageSendSchema, projectJoinSchema, typingSchema } from './realtime.schemas.js';
import { RealtimeService } from './realtime.service.js';

interface SocketData {
  joinedProjectIds: Set<string>;
  user: AuthenticatedUser;
}

interface RealtimeServerOptions {
  corsOrigin: string;
  domainEvents: DomainEventBus;
  httpServer: HttpServer;
  pool: DatabasePool;
  presenceTtlMs?: number;
  tokenService: TokenService;
  typingTtlMs?: number;
}

const projectRoom = (projectId: string) => `project:${projectId}`;
const conversationRoom = (projectId: string) => `conversation:${projectId}`;
const userInProject = (projectId: string, userId: string) => `${projectId}:${userId}`;

const ackError = <T>(error: unknown): RealtimeAck<T> => {
  if (error instanceof ApiError) {
    return { error: { code: error.code, message: error.message }, ok: false };
  }
  if (error instanceof ZodError) {
    return {
      error: { code: 'REALTIME_INPUT_INVALID', message: 'The realtime payload is invalid.' },
      ok: false,
    };
  }
  console.error('Realtime event failed.', error);
  return {
    error: { code: 'REALTIME_INTERNAL_ERROR', message: 'The realtime event could not complete.' },
    ok: false,
  };
};

export const attachRealtimeServer = ({
  corsOrigin,
  domainEvents,
  httpServer,
  pool,
  presenceTtlMs = 15_000,
  tokenService,
  typingTtlMs = 4_000,
}: RealtimeServerOptions) => {
  const realtimeService = new RealtimeService(pool);
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, {
    cors: { origin: corsOrigin },
    maxHttpBufferSize: 16_384,
  });
  const presence = new Map<string, Map<string, Set<string>>>();
  const presenceTimers = new Map<string, NodeJS.Timeout>();
  const typingTimers = new Map<string, NodeJS.Timeout>();

  const onlineUsers = (projectId: string) => [...(presence.get(projectId)?.keys() ?? [])];

  const addPresence = (projectId: string, userId: string, socketId: string) => {
    const timerKey = userInProject(projectId, userId);
    const pendingOffline = presenceTimers.get(timerKey);
    if (pendingOffline) {
      clearTimeout(pendingOffline);
      presenceTimers.delete(timerKey);
    }
    const projectPresence = presence.get(projectId) ?? new Map<string, Set<string>>();
    const sockets = projectPresence.get(userId) ?? new Set<string>();
    const wasOnline = sockets.size > 0;
    sockets.add(socketId);
    projectPresence.set(userId, sockets);
    presence.set(projectId, projectPresence);
    if (!wasOnline) {
      io.to(projectRoom(projectId)).emit('presence:changed', { online: true, projectId, userId });
    }
  };

  const removePresence = (projectId: string, userId: string, socketId: string) => {
    const sockets = presence.get(projectId)?.get(userId);
    if (!sockets) return;
    sockets.delete(socketId);
    if (sockets.size > 0) return;

    const timerKey = userInProject(projectId, userId);
    const timer = setTimeout(() => {
      const projectPresence = presence.get(projectId);
      const currentSockets = projectPresence?.get(userId);
      if (currentSockets?.size) return;
      projectPresence?.delete(userId);
      if (projectPresence?.size === 0) presence.delete(projectId);
      presenceTimers.delete(timerKey);
      io.to(projectRoom(projectId)).emit('presence:changed', { online: false, projectId, userId });
    }, presenceTtlMs);
    timer.unref();
    presenceTimers.set(timerKey, timer);
  };

  io.use(async (socket, next) => {
    const token = socket.handshake.auth['token'];
    if (typeof token !== 'string' || !token) {
      next(new Error('AUTHENTICATION_REQUIRED'));
      return;
    }
    try {
      socket.data.user = await tokenService.verifyAccessToken(token);
      socket.data.joinedProjectIds = new Set();
      next();
    } catch {
      next(new Error('AUTH_ACCESS_TOKEN_INVALID'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('project:join', async (rawInput, acknowledge) => {
      try {
        const input = projectJoinSchema.parse(rawInput);
        await realtimeService.requireMember(input.projectId, socket.data.user.id);
        await socket.join([projectRoom(input.projectId), conversationRoom(input.projectId)]);
        const messages = await realtimeService.listMessages(input.projectId, socket.data.user.id, {
          ...(input.afterMessageId ? { afterMessageId: input.afterMessageId } : {}),
          limit: 100,
        });
        socket.data.joinedProjectIds.add(input.projectId);
        addPresence(input.projectId, socket.data.user.id, socket.id);
        acknowledge({ data: { messages, onlineUserIds: onlineUsers(input.projectId) }, ok: true });
      } catch (error) {
        acknowledge(ackError(error));
      }
    });

    socket.on('message:send', async (rawInput, acknowledge) => {
      try {
        const input = messageSendSchema.parse(rawInput);
        const result = await realtimeService.sendMessage(socket.data.user.id, input);
        if (result.created) {
          io.to(conversationRoom(input.projectId)).emit('message:created', result.message);
        }
        acknowledge({ data: { message: result.message }, ok: true });
      } catch (error) {
        acknowledge(ackError(error));
      }
    });

    socket.on('typing:set', async (rawInput, acknowledge) => {
      try {
        const input = typingSchema.parse(rawInput);
        await realtimeService.requireMember(input.projectId, socket.data.user.id);
        const timerKey = userInProject(input.projectId, socket.data.user.id);
        const currentTimer = typingTimers.get(timerKey);
        if (currentTimer) clearTimeout(currentTimer);
        socket.to(conversationRoom(input.projectId)).emit('typing:changed', {
          active: input.active,
          projectId: input.projectId,
          userId: socket.data.user.id,
        });
        if (input.active) {
          const timer = setTimeout(() => {
            typingTimers.delete(timerKey);
            io.to(conversationRoom(input.projectId)).emit('typing:changed', {
              active: false,
              projectId: input.projectId,
              userId: socket.data.user.id,
            });
          }, typingTtlMs);
          timer.unref();
          typingTimers.set(timerKey, timer);
        } else {
          typingTimers.delete(timerKey);
        }
        acknowledge({ data: {}, ok: true });
      } catch (error) {
        acknowledge(ackError(error));
      }
    });

    socket.on('disconnect', () => {
      for (const projectId of socket.data.joinedProjectIds) {
        removePresence(projectId, socket.data.user.id, socket.id);
        const typingKey = userInProject(projectId, socket.data.user.id);
        const typingTimer = typingTimers.get(typingKey);
        if (typingTimer) clearTimeout(typingTimer);
        typingTimers.delete(typingKey);
        io.to(conversationRoom(projectId)).emit('typing:changed', {
          active: false,
          projectId,
          userId: socket.data.user.id,
        });
      }
    });
  });

  const unsubscribe = domainEvents.subscribe((event) => {
    if (event.type === 'task.changed') {
      io.to(projectRoom(event.task.projectId)).emit('task:changed', {
        action: event.action,
        actorId: event.actorId,
        task: event.task,
      });
    }
  });

  io.engine.on('close', () => {
    unsubscribe();
    for (const timer of presenceTimers.values()) clearTimeout(timer);
    for (const timer of typingTimers.values()) clearTimeout(timer);
  });

  return io;
};
