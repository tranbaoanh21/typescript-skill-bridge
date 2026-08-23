export type GlobalRole = 'STUDENT' | 'MENTOR' | 'ADMIN';

export interface User {
  email: string;
  globalRole: GlobalRole;
  id: string;
}

export interface Tokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  tokenType: 'Bearer';
}

export interface AuthResult {
  tokens: Tokens;
  user: User;
}

export interface Skill {
  id: string;
  name: string;
  slug: string;
}

export interface ProfileSkill {
  level: number;
  name: string;
  skillId: string;
  slug: string;
}

export interface RequiredSkill extends Skill {
  desiredLevel: number;
  positions: number;
  skillId: string;
}

export interface Project {
  capacity: number;
  createdAt: string;
  description: string;
  id: string;
  memberCount: number;
  ownerDisplayName: string;
  ownerId: string;
  requiredSkills: RequiredSkill[];
  slug: string;
  status: 'DRAFT' | 'RECRUITING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED';
  title: string;
  updatedAt: string;
  version: number;
}

export interface Profile {
  bio: string | null;
  displayName: string;
  email: string;
  globalRole: GlobalRole;
  graduationYear: number | null;
  links: Array<{ id: string; kind: string; label: string; position: number; url: string }>;
  major: string | null;
  skills: ProfileSkill[];
  university: string;
  userId: string;
}

export interface Application {
  applicantId: string;
  applicantDisplayName?: string;
  coverLetter: string;
  createdAt: string;
  decisionNote: string | null;
  id: string;
  email?: string;
  projectId: string;
  projectSlug?: string;
  projectTitle?: string;
  status: 'PENDING' | 'WITHDRAWN' | 'ACCEPTED' | 'REJECTED';
}

export interface Member {
  displayName: string;
  email: string;
  joinedAt: string;
  projectRole: 'OWNER' | 'LEADER' | 'MEMBER';
  userId: string;
}

export interface Sprint {
  endsOn: string;
  goal: string | null;
  id: string;
  name: string;
  projectId: string;
  startsOn: string;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
  version: number;
}

export interface TaskAssignee {
  displayName: string;
  userId: string;
}

export interface ProjectTask {
  assignees: TaskAssignee[];
  description: string | null;
  dueAt: string | null;
  id: string;
  position: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  projectId: string;
  sprintId: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
  title: string;
  version: number;
}

export interface ApiErrorBody {
  error: { code: string; details?: unknown; message: string; requestId: string };
}
