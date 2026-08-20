import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';

import { unauthorized } from '../../shared/http/api-error.js';
import type { AuthenticatedUser, PublicUser } from './auth.types.js';

export interface TokenServiceOptions {
  accessTokenTtlSeconds: number;
  audience: string;
  issuer: string;
  refreshTokenTtlDays: number;
  secret: string;
}

export interface NewRefreshSession {
  expiresAt: Date;
  familyId: string;
  id: string;
  ipAddress?: string;
  tokenHash: string;
  userAgent?: string;
}

export class TokenService {
  readonly accessTokenTtlSeconds: number;
  private readonly audience: string;
  private readonly issuer: string;
  private readonly refreshTokenTtlDays: number;
  private readonly secret: Uint8Array;

  constructor(options: TokenServiceOptions) {
    this.accessTokenTtlSeconds = options.accessTokenTtlSeconds;
    this.audience = options.audience;
    this.issuer = options.issuer;
    this.refreshTokenTtlDays = options.refreshTokenTtlDays;
    this.secret = new TextEncoder().encode(options.secret);
  }

  async createAccessToken(user: PublicUser) {
    return new SignJWT({ email: user.email, globalRole: user.globalRole })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setAudience(this.audience)
      .setExpirationTime(`${this.accessTokenTtlSeconds}s`)
      .setIssuedAt()
      .setIssuer(this.issuer)
      .setJti(randomUUID())
      .setSubject(user.id)
      .sign(this.secret);
  }

  createRefreshSession(
    metadata: { ipAddress?: string; userAgent?: string },
    familyId = randomUUID(),
  ) {
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + this.refreshTokenTtlDays);

    const session: NewRefreshSession = {
      id: randomUUID(),
      familyId,
      expiresAt,
      tokenHash: this.hashRefreshToken(refreshToken),
      ...(metadata.ipAddress === undefined ? {} : { ipAddress: metadata.ipAddress }),
      ...(metadata.userAgent === undefined ? {} : { userAgent: metadata.userAgent }),
    };

    return { refreshToken, session };
  }

  hashRefreshToken(refreshToken: string) {
    return createHash('sha256').update(refreshToken, 'utf8').digest('hex');
  }

  async verifyAccessToken(accessToken: string): Promise<AuthenticatedUser> {
    try {
      const { payload } = await jwtVerify(accessToken, this.secret, {
        algorithms: ['HS256'],
        audience: this.audience,
        issuer: this.issuer,
      });

      if (
        !payload.sub ||
        typeof payload['email'] !== 'string' ||
        !['STUDENT', 'MENTOR', 'ADMIN'].includes(String(payload['globalRole']))
      ) {
        throw new Error('Required access token claims are missing.');
      }

      return {
        id: payload.sub,
        email: payload['email'],
        globalRole: payload['globalRole'] as AuthenticatedUser['globalRole'],
      };
    } catch {
      throw unauthorized('AUTH_ACCESS_TOKEN_INVALID', 'The access token is invalid or expired.');
    }
  }
}
