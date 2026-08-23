import type { DatabasePool } from '@skillbridge/database';

import { notFound } from '../../shared/http/api-error.js';

export class NotificationService {
  constructor(private readonly pool: DatabasePool) {}

  async list(recipientId: string, limit: number) {
    const result = await this.pool.query(
      `SELECT id, source_event_id AS "sourceEventId", type, title, body, data,
              read_at AS "readAt", created_at AS "createdAt"
       FROM notifications
       WHERE recipient_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [recipientId, limit],
    );
    return result.rows;
  }

  async markRead(notificationId: string, recipientId: string) {
    const result = await this.pool.query(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, now())
       WHERE id = $1 AND recipient_id = $2
       RETURNING id, source_event_id AS "sourceEventId", type, title, body, data,
                 read_at AS "readAt", created_at AS "createdAt"`,
      [notificationId, recipientId],
    );
    if (!result.rows[0]) {
      throw notFound('NOTIFICATION_NOT_FOUND', 'The notification does not exist.');
    }
    return result.rows[0];
  }
}
