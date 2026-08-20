import { and, eq, isNull } from 'drizzle-orm';

import { type DatabaseClient, profiles, refreshSessions, users } from '@skillbridge/database';

import type { PublicUser } from './auth.types.js';
import type { NewRefreshSession } from './token.service.js';

export interface AuthUserRecord extends PublicUser {
  passwordHash: string;
  status: 'ACTIVE' | 'SUSPENDED';
}

export type RefreshRotationResult =
  { kind: 'invalid' } | { kind: 'reused' } | { kind: 'rotated'; user: PublicUser };

const publicUserSelection = {
  email: users.email,
  globalRole: users.globalRole,
  id: users.id,
};

const sessionValues = (
  userId: string,
  session: NewRefreshSession,
  familyId = session.familyId,
) => ({
  expiresAt: session.expiresAt,
  familyId,
  id: session.id,
  ...(session.ipAddress === undefined ? {} : { ipAddress: session.ipAddress }),
  tokenHash: session.tokenHash,
  userId,
  ...(session.userAgent === undefined ? {} : { userAgent: session.userAgent }),
});

export class AuthRepository {
  constructor(private readonly database: DatabaseClient) {}

  async createUserWithSession(input: {
    displayName: string;
    email: string;
    passwordHash: string;
    session: NewRefreshSession;
  }): Promise<PublicUser> {
    return this.database.transaction(async (transaction) => {
      const [user] = await transaction
        .insert(users)
        .values({ email: input.email, passwordHash: input.passwordHash })
        .returning(publicUserSelection);

      if (!user) {
        throw new Error('PostgreSQL did not return the created user.');
      }

      await transaction
        .insert(profiles)
        .values({ displayName: input.displayName, userId: user.id });
      await transaction.insert(refreshSessions).values(sessionValues(user.id, input.session));

      return user;
    });
  }

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const [user] = await this.database
      .select({
        ...publicUserSelection,
        passwordHash: users.passwordHash,
        status: users.status,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return user ?? null;
  }

  async createSession(userId: string, session: NewRefreshSession) {
    await this.database.insert(refreshSessions).values(sessionValues(userId, session));
  }

  async rotateRefreshSession(
    currentTokenHash: string,
    replacementSession: NewRefreshSession,
    now: Date,
  ): Promise<RefreshRotationResult> {
    return this.database.transaction(async (transaction) => {
      const [record] = await transaction
        .select({
          email: users.email,
          expiresAt: refreshSessions.expiresAt,
          familyId: refreshSessions.familyId,
          globalRole: users.globalRole,
          id: refreshSessions.id,
          replacedBySessionId: refreshSessions.replacedBySessionId,
          revokedAt: refreshSessions.revokedAt,
          userId: users.id,
          userStatus: users.status,
        })
        .from(refreshSessions)
        .innerJoin(users, eq(refreshSessions.userId, users.id))
        .where(eq(refreshSessions.tokenHash, currentTokenHash))
        .for('update')
        .limit(1);

      if (!record) {
        return { kind: 'invalid' };
      }

      if (record.revokedAt) {
        if (record.replacedBySessionId) {
          await transaction
            .update(refreshSessions)
            .set({ revokedAt: now })
            .where(
              and(eq(refreshSessions.familyId, record.familyId), isNull(refreshSessions.revokedAt)),
            );
          return { kind: 'reused' };
        }

        return { kind: 'invalid' };
      }

      if (record.expiresAt <= now || record.userStatus !== 'ACTIVE') {
        await transaction
          .update(refreshSessions)
          .set({ revokedAt: now })
          .where(eq(refreshSessions.id, record.id));
        return { kind: 'invalid' };
      }

      await transaction
        .insert(refreshSessions)
        .values(sessionValues(record.userId, replacementSession, record.familyId));
      await transaction
        .update(refreshSessions)
        .set({ replacedBySessionId: replacementSession.id, revokedAt: now })
        .where(eq(refreshSessions.id, record.id));

      return {
        kind: 'rotated',
        user: {
          email: record.email,
          globalRole: record.globalRole,
          id: record.userId,
        },
      };
    });
  }

  async revokeRefreshSession(tokenHash: string, now: Date) {
    await this.database
      .update(refreshSessions)
      .set({ revokedAt: now })
      .where(and(eq(refreshSessions.tokenHash, tokenHash), isNull(refreshSessions.revokedAt)));
  }
}

export const isUniqueViolation = (error: unknown): boolean => {
  let candidate: unknown = error;

  for (let depth = 0; depth < 4 && candidate && typeof candidate === 'object'; depth += 1) {
    if ('code' in candidate && candidate.code === '23505') {
      return true;
    }
    candidate = 'cause' in candidate ? candidate.cause : undefined;
  }

  return false;
};
