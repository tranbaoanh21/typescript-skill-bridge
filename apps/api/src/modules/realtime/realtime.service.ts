import type { ProjectMessage } from '@skillbridge/contracts';
import type { DatabasePool } from '@skillbridge/database';

import { forbidden, notFound } from '../../shared/http/api-error.js';

export interface MessageSendInput {
  body: string;
  clientMessageId: string;
  projectId: string;
}

const messageSelection = `
  pm.id,
  pm.project_id AS "projectId",
  pm.client_message_id AS "clientMessageId",
  pm.body,
  pm.created_at AS "createdAt",
  jsonb_build_object(
    'userId', pm.sender_id,
    'displayName', profile.display_name
  ) AS sender`;

type DatabaseMessage = Omit<ProjectMessage, 'createdAt'> & { createdAt: Date };

const serializeMessage = (message: DatabaseMessage): ProjectMessage => ({
  ...message,
  createdAt: message.createdAt.toISOString(),
});

export class RealtimeService {
  constructor(private readonly pool: DatabasePool) {}

  async requireMember(projectId: string, userId: string) {
    const membership = await this.pool.query(
      'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, userId],
    );
    if (!membership.rows[0]) {
      throw forbidden(
        'PROJECT_MEMBERSHIP_REQUIRED',
        'Project membership is required for this realtime room.',
      );
    }
  }

  async listMessages(
    projectId: string,
    userId: string,
    options: { afterMessageId?: string; limit: number },
  ) {
    await this.requireMember(projectId, userId);

    if (options.afterMessageId) {
      const cursor = await this.pool.query<{ createdAt: Date; id: string }>(
        `SELECT id, created_at AS "createdAt"
         FROM project_messages WHERE id = $1 AND project_id = $2`,
        [options.afterMessageId, projectId],
      );
      if (!cursor.rows[0]) {
        throw notFound('MESSAGE_CURSOR_NOT_FOUND', 'The message cursor does not exist.');
      }
      const result = await this.pool.query<DatabaseMessage>(
        `WITH message_cursor AS (
           SELECT id, created_at
           FROM project_messages WHERE id = $2 AND project_id = $1
         )
         SELECT ${messageSelection}
         FROM project_messages pm
         JOIN profiles profile ON profile.user_id = pm.sender_id
         CROSS JOIN message_cursor cursor
         WHERE pm.project_id = $1
           AND (pm.created_at, pm.id) > (cursor.created_at, cursor.id)
         ORDER BY pm.created_at, pm.id
         LIMIT $3`,
        [projectId, cursor.rows[0].id, options.limit],
      );
      return result.rows.map(serializeMessage);
    }

    const result = await this.pool.query<DatabaseMessage>(
      `SELECT * FROM (
         SELECT ${messageSelection}
         FROM project_messages pm
         JOIN profiles profile ON profile.user_id = pm.sender_id
         WHERE pm.project_id = $1
         ORDER BY pm.created_at DESC, pm.id DESC
         LIMIT $2
       ) recent
       ORDER BY "createdAt", id`,
      [projectId, options.limit],
    );
    return result.rows.map(serializeMessage);
  }

  async sendMessage(userId: string, input: MessageSendInput) {
    await this.requireMember(input.projectId, userId);
    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO project_messages (project_id, sender_id, client_message_id, body)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (sender_id, client_message_id) DO NOTHING
       RETURNING id`,
      [input.projectId, userId, input.clientMessageId, input.body],
    );
    const result = await this.pool.query<DatabaseMessage>(
      `SELECT ${messageSelection}
       FROM project_messages pm
       JOIN profiles profile ON profile.user_id = pm.sender_id
       WHERE pm.id = $1 OR (pm.sender_id = $2 AND pm.client_message_id = $3)
       ORDER BY pm.id = $1 DESC
       LIMIT 1`,
      [inserted.rows[0]?.id ?? null, userId, input.clientMessageId],
    );
    return {
      created: Boolean(inserted.rows[0]),
      message: serializeMessage(result.rows[0]!),
    };
  }
}
