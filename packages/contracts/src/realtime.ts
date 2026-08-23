export interface ProjectMessage {
  body: string;
  clientMessageId: string;
  createdAt: string;
  id: string;
  projectId: string;
  sender: {
    displayName: string;
    userId: string;
  };
}

export interface RealtimeTask {
  assignees: Array<{ displayName: string; userId: string }>;
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

export type RealtimeAck<T> =
  { data: T; ok: true } | { error: { code: string; message: string }; ok: false };

export interface ProjectJoinInput {
  afterMessageId?: string;
  projectId: string;
}

export interface MessageSendInput {
  body: string;
  clientMessageId: string;
  projectId: string;
}

export interface TypingInput {
  active: boolean;
  projectId: string;
}

export interface ClientToServerEvents {
  'message:send': (
    input: MessageSendInput,
    acknowledge: (result: RealtimeAck<{ message: ProjectMessage }>) => void,
  ) => void;
  'project:join': (
    input: ProjectJoinInput,
    acknowledge: (
      result: RealtimeAck<{
        messages: ProjectMessage[];
        onlineUserIds: string[];
      }>,
    ) => void,
  ) => void;
  'typing:set': (
    input: TypingInput,
    acknowledge: (result: RealtimeAck<Record<string, never>>) => void,
  ) => void;
}

export interface ServerToClientEvents {
  'message:created': (message: ProjectMessage) => void;
  'presence:changed': (event: { online: boolean; projectId: string; userId: string }) => void;
  'task:changed': (event: {
    action: 'CREATED' | 'UPDATED';
    actorId: string;
    task: RealtimeTask;
  }) => void;
  'typing:changed': (event: { active: boolean; projectId: string; userId: string }) => void;
}
