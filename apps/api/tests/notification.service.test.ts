import type { DatabasePool } from '@skillbridge/database';
import { describe, expect, it, vi } from 'vitest';

import { NotificationService } from '../src/modules/notifications/notification.service.js';

describe('NotificationService', () => {
  it('lists recipient notifications with a bounded limit', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'notification-id' }] });
    const service = new NotificationService({ query } as unknown as DatabasePool);

    await expect(service.list('recipient-id', 30)).resolves.toEqual([{ id: 'notification-id' }]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE recipient_id = $1'), [
      'recipient-id',
      30,
    ]);
  });

  it('marks an owned notification read and hides missing notifications', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 'notification-id', readAt: new Date() }] })
      .mockResolvedValueOnce({ rows: [] });
    const service = new NotificationService({ query } as unknown as DatabasePool);

    await expect(service.markRead('notification-id', 'recipient-id')).resolves.toMatchObject({
      id: 'notification-id',
    });
    await expect(service.markRead('missing-id', 'recipient-id')).rejects.toMatchObject({
      code: 'NOTIFICATION_NOT_FOUND',
      status: 404,
    });
  });
});
