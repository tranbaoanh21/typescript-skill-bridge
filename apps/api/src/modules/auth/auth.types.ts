export type GlobalRole = 'STUDENT' | 'MENTOR' | 'ADMIN';

export interface PublicUser {
  email: string;
  globalRole: GlobalRole;
  id: string;
}

export type AuthenticatedUser = PublicUser;

export interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface TokenPair {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  tokenType: 'Bearer';
}

export interface AuthResult {
  tokens: TokenPair;
  user: PublicUser;
}

export interface RegisterInput {
  displayName: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthServiceContract {
  login(input: LoginInput, metadata: SessionMetadata): Promise<AuthResult>;
  logout(refreshToken: string): Promise<void>;
  refresh(refreshToken: string, metadata: SessionMetadata): Promise<AuthResult>;
  register(input: RegisterInput, metadata: SessionMetadata): Promise<AuthResult>;
}
