import type {
  ClientToServerEvents,
  ProjectMessage,
  ServerToClientEvents,
} from '@skillbridge/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import { useSession } from './session';
import type { ProjectTask } from './types';

const realtimeUrl = import.meta.env['VITE_REALTIME_URL'] ?? 'http://localhost:3000';

type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const mergeMessages = (current: ProjectMessage[], incoming: ProjectMessage[]) => {
  const messages = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()].sort((left, right) =>
    left.createdAt === right.createdAt
      ? left.id.localeCompare(right.id)
      : left.createdAt.localeCompare(right.createdAt),
  );
};

export const useProjectRealtime = (projectId: string) => {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const socketRef = useRef<RealtimeSocket | null>(null);
  const lastMessageId = useRef<string | undefined>(undefined);
  const [connection, setConnection] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [messages, setMessages] = useState<ProjectMessage[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);

  useEffect(() => {
    const accessToken = session?.tokens.accessToken;
    if (!accessToken || !projectId) return;

    const socket: RealtimeSocket = io(realtimeUrl, { auth: { token: accessToken } });
    socketRef.current = socket;
    const join = async () => {
      setConnection('connecting');
      try {
        const result = await socket.timeout(8_000).emitWithAck('project:join', {
          ...(lastMessageId.current ? { afterMessageId: lastMessageId.current } : {}),
          projectId,
        });
        if (!result.ok) throw new Error(result.error.message);
        setMessages((current) => mergeMessages(current, result.data.messages));
        setOnlineUserIds(result.data.onlineUserIds);
        setConnection('live');
      } catch {
        setConnection('offline');
      }
    };

    socket.on('connect', () => void join());
    socket.on('disconnect', () => setConnection('offline'));
    socket.on('connect_error', () => setConnection('offline'));
    socket.on('message:created', (message) => {
      setMessages((current) => mergeMessages(current, [message]));
    });
    socket.on('presence:changed', (event) => {
      if (event.projectId !== projectId) return;
      setOnlineUserIds((current) =>
        event.online
          ? [...new Set([...current, event.userId])]
          : current.filter((userId) => userId !== event.userId),
      );
    });
    socket.on('typing:changed', (event) => {
      if (event.projectId !== projectId) return;
      setTypingUserIds((current) =>
        event.active
          ? [...new Set([...current, event.userId])]
          : current.filter((userId) => userId !== event.userId),
      );
    });
    socket.on('task:changed', (event) => {
      if (event.task.projectId !== projectId) return;
      queryClient.setQueryData<{ tasks: ProjectTask[] }>(['tasks', projectId], (current) => {
        const tasks = current?.tasks ?? [];
        const exists = tasks.some((task) => task.id === event.task.id);
        return {
          tasks: exists
            ? tasks.map((task) => (task.id === event.task.id ? event.task : task))
            : [...tasks, event.task],
        };
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnection('offline');
      setOnlineUserIds([]);
      setTypingUserIds([]);
    };
  }, [projectId, queryClient, session?.tokens.accessToken]);

  useEffect(() => {
    lastMessageId.current = messages.at(-1)?.id;
  }, [messages]);

  const sendMessage = useCallback(
    async (body: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) throw new Error('Realtime connection is offline.');
      const result = await socket.timeout(8_000).emitWithAck('message:send', {
        body,
        clientMessageId: crypto.randomUUID(),
        projectId,
      });
      if (!result.ok) throw new Error(result.error.message);
      setMessages((current) => mergeMessages(current, [result.data.message]));
      return result.data.message;
    },
    [projectId],
  );

  const setTyping = useCallback(
    (active: boolean) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit('typing:set', { active, projectId }, () => undefined);
    },
    [projectId],
  );

  return {
    connection,
    messages,
    onlineUserIds,
    sendMessage,
    setTyping,
    typingUserIds,
  };
};
