import { ApiError, forbidden, unauthorized } from '../../shared/http/api-error.js';
import { AuthRepository, isUniqueViolation } from './auth.repository.js';
import type {
  AuthResult,
  LoginInput,
  PublicUser,
  RegisterInput,
  SessionMetadata,
} from './auth.types.js';
import { dummyPasswordHash, hashPassword, verifyPassword } from './password.js';
import { TokenService } from './token.service.js';

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly tokenService: TokenService,
  ) {}

  async register(input: RegisterInput, metadata: SessionMetadata): Promise<AuthResult> {
    const passwordHash = await hashPassword(input.password);
    const { refreshToken, session } = this.tokenService.createRefreshSession(metadata);

    try {
      const user = await this.repository.createUserWithSession({
        displayName: input.displayName,
        email: input.email,
        passwordHash,
        session,
      });

      return this.createAuthResult(user, refreshToken);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError({
          code: 'AUTH_EMAIL_ALREADY_EXISTS',
          message: 'An account with this email already exists.',
          status: 409,
        });
      }
      throw error;
    }
  }

  async login(input: LoginInput, metadata: SessionMetadata): Promise<AuthResult> {
    const record = await this.repository.findUserByEmail(input.email);
    const passwordMatches = await verifyPassword(
      record?.passwordHash ?? dummyPasswordHash,
      input.password,
    );

    if (!record || !passwordMatches) {
      throw unauthorized('AUTH_INVALID_CREDENTIALS', 'The email or password is incorrect.');
    }

    if (record.status !== 'ACTIVE') {
      throw forbidden('AUTH_ACCOUNT_SUSPENDED', 'This account is suspended.');
    }

    const { passwordHash: _passwordHash, status: _status, ...user } = record;
    const { refreshToken, session } = this.tokenService.createRefreshSession(metadata);
    await this.repository.createSession(user.id, session);

    return this.createAuthResult(user, refreshToken);
  }

  async refresh(refreshToken: string, metadata: SessionMetadata): Promise<AuthResult> {
    const currentTokenHash = this.tokenService.hashRefreshToken(refreshToken);
    const replacement = this.tokenService.createRefreshSession(metadata);
    const rotation = await this.repository.rotateRefreshSession(
      currentTokenHash,
      replacement.session,
      new Date(),
    );

    if (rotation.kind === 'reused') {
      throw unauthorized(
        'AUTH_REFRESH_TOKEN_REUSED',
        'Refresh token reuse was detected. Sign in again.',
      );
    }

    if (rotation.kind === 'invalid') {
      throw unauthorized('AUTH_REFRESH_TOKEN_INVALID', 'The refresh token is invalid or expired.');
    }

    return this.createAuthResult(rotation.user, replacement.refreshToken);
  }

  async logout(refreshToken: string) {
    await this.repository.revokeRefreshSession(
      this.tokenService.hashRefreshToken(refreshToken),
      new Date(),
    );
  }

  private async createAuthResult(user: PublicUser, refreshToken: string): Promise<AuthResult> {
    return {
      tokens: {
        accessToken: await this.tokenService.createAccessToken(user),
        expiresIn: this.tokenService.accessTokenTtlSeconds,
        refreshToken,
        tokenType: 'Bearer',
      },
      user,
    };
  }
}
