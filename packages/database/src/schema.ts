import { sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const timestamps = () => ({
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
});

export const globalRole = pgEnum('global_role', ['STUDENT', 'MENTOR', 'ADMIN']);
export const userStatus = pgEnum('user_status', ['ACTIVE', 'SUSPENDED']);
export const portfolioLinkKind = pgEnum('portfolio_link_kind', [
  'GITHUB',
  'LINKEDIN',
  'WEBSITE',
  'DEMO',
  'OTHER',
]);
export const projectStatus = pgEnum('project_status', [
  'DRAFT',
  'RECRUITING',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'ARCHIVED',
]);
export const applicationStatus = pgEnum('application_status', [
  'PENDING',
  'WITHDRAWN',
  'ACCEPTED',
  'REJECTED',
]);
export const projectRole = pgEnum('project_role', ['OWNER', 'LEADER', 'MEMBER']);
export const sprintStatus = pgEnum('sprint_status', ['PLANNED', 'ACTIVE', 'COMPLETED']);
export const taskStatus = pgEnum('task_status', ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']);
export const taskPriority = pgEnum('task_priority', ['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 320 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    globalRole: globalRole('global_role').default('STUDENT').notNull(),
    status: userStatus('status').default('ACTIVE').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { mode: 'date', withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    check(
      'users_email_normalized_check',
      sql`${table.email} = lower(btrim(${table.email})) and length(${table.email}) > 3`,
    ),
  ],
);

export const profiles = pgTable(
  'profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: varchar('display_name', { length: 120 }).notNull(),
    bio: text('bio'),
    university: varchar('university', { length: 160 }).default('HCMUT').notNull(),
    major: varchar('major', { length: 160 }),
    graduationYear: smallint('graduation_year'),
    ...timestamps(),
  },
  (table) => [
    check('profiles_display_name_not_blank_check', sql`length(btrim(${table.displayName})) > 0`),
    check(
      'profiles_graduation_year_check',
      sql`${table.graduationYear} is null or ${table.graduationYear} between 2000 and 2200`,
    ),
  ],
);

export const portfolioLinks = pgTable(
  'portfolio_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: portfolioLinkKind('kind').default('OTHER').notNull(),
    label: varchar('label', { length: 80 }).notNull(),
    url: text('url').notNull(),
    position: smallint('position').default(0).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('portfolio_links_user_url_unique').on(table.userId, table.url),
    index('portfolio_links_user_position_idx').on(table.userId, table.position),
    check('portfolio_links_position_check', sql`${table.position} >= 0`),
  ],
);

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 80 }).notNull().unique(),
    name: varchar('name', { length: 100 }).notNull().unique(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('skills_slug_format_check', sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check('skills_name_not_blank_check', sql`length(btrim(${table.name})) > 0`),
  ],
);

export const userSkills = pgTable(
  'user_skills',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    level: smallint('level').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: 'user_skills_pk', columns: [table.userId, table.skillId] }),
    index('user_skills_skill_level_idx').on(table.skillId, table.level),
    check('user_skills_level_check', sql`${table.level} between 1 and 5`),
  ],
);

export const refreshSessions = pgTable(
  'refresh_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { mode: 'date', withTimezone: true }),
    replacedBySessionId: uuid('replaced_by_session_id').references(
      (): AnyPgColumn => refreshSessions.id,
      { onDelete: 'set null' },
    ),
    userAgent: text('user_agent'),
    ipAddress: varchar('ip_address', { length: 45 }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('refresh_sessions_user_family_idx').on(table.userId, table.familyId),
    index('refresh_sessions_expires_at_idx').on(table.expiresAt),
    check(
      'refresh_sessions_rotation_check',
      sql`${table.replacedBySessionId} is null or ${table.revokedAt} is not null`,
    ),
  ],
);

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    slug: varchar('slug', { length: 120 }).notNull().unique(),
    title: varchar('title', { length: 180 }).notNull(),
    description: text('description').notNull(),
    status: projectStatus('status').default('DRAFT').notNull(),
    capacity: smallint('capacity').notNull(),
    version: integer('version').default(1).notNull(),
    ...timestamps(),
  },
  (table) => [
    index('projects_owner_idx').on(table.ownerId),
    index('projects_discovery_idx').on(table.status, table.createdAt),
    check('projects_slug_format_check', sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check('projects_title_not_blank_check', sql`length(btrim(${table.title})) > 0`),
    check('projects_description_not_blank_check', sql`length(btrim(${table.description})) > 0`),
    check('projects_capacity_check', sql`${table.capacity} > 0`),
    check('projects_version_check', sql`${table.version} > 0`),
  ],
);

export const projectRequiredSkills = pgTable(
  'project_required_skills',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'restrict' }),
    desiredLevel: smallint('desired_level').notNull(),
    positions: smallint('positions').default(1).notNull(),
  },
  (table) => [
    primaryKey({
      name: 'project_required_skills_pk',
      columns: [table.projectId, table.skillId],
    }),
    index('project_required_skills_skill_idx').on(table.skillId),
    check(
      'project_required_skills_desired_level_check',
      sql`${table.desiredLevel} between 1 and 5`,
    ),
    check('project_required_skills_positions_check', sql`${table.positions} > 0`),
  ],
);

export const projectApplications = pgTable(
  'project_applications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    applicantId: uuid('applicant_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    coverLetter: text('cover_letter').notNull(),
    status: applicationStatus('status').default('PENDING').notNull(),
    decidedAt: timestamp('decided_at', { mode: 'date', withTimezone: true }),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'restrict' }),
    decisionNote: text('decision_note'),
    ...timestamps(),
  },
  (table) => [
    unique('project_applications_identity_unique').on(table.id, table.projectId, table.applicantId),
    uniqueIndex('project_applications_one_pending_idx')
      .on(table.projectId, table.applicantId)
      .where(sql`${table.status} = 'PENDING'`),
    index('project_applications_project_status_idx').on(table.projectId, table.status),
    index('project_applications_applicant_idx').on(table.applicantId, table.createdAt),
    check(
      'project_applications_cover_letter_not_blank_check',
      sql`length(btrim(${table.coverLetter})) > 0`,
    ),
    check(
      'project_applications_decision_check',
      sql`(
        ${table.status} = 'PENDING'
        and ${table.decidedAt} is null
        and ${table.decidedBy} is null
      ) or (
        ${table.status} = 'WITHDRAWN'
        and ${table.decidedAt} is not null
        and ${table.decidedBy} is null
      ) or (
        ${table.status} in ('ACCEPTED', 'REJECTED')
        and ${table.decidedAt} is not null
        and ${table.decidedBy} is not null
      )`,
    ),
  ],
);

export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    projectRole: projectRole('project_role').default('MEMBER').notNull(),
    sourceApplicationId: uuid('source_application_id'),
    joinedAt: timestamp('joined_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: 'project_members_pk', columns: [table.projectId, table.userId] }),
    unique('project_members_source_application_unique').on(table.sourceApplicationId),
    foreignKey({
      name: 'project_members_application_identity_fk',
      columns: [table.sourceApplicationId, table.projectId, table.userId],
      foreignColumns: [
        projectApplications.id,
        projectApplications.projectId,
        projectApplications.applicantId,
      ],
    }).onDelete('restrict'),
    index('project_members_user_idx').on(table.userId),
    check(
      'project_members_owner_source_check',
      sql`${table.projectRole} <> 'OWNER' or ${table.sourceApplicationId} is null`,
    ),
  ],
);

export const sprints = pgTable(
  'sprints',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    goal: text('goal'),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }).notNull(),
    status: sprintStatus('status').default('PLANNED').notNull(),
    version: integer('version').default(1).notNull(),
    ...timestamps(),
  },
  (table) => [
    unique('sprints_identity_unique').on(table.id, table.projectId),
    index('sprints_project_status_idx').on(table.projectId, table.status),
    check('sprints_name_not_blank_check', sql`length(btrim(${table.name})) > 0`),
    check('sprints_dates_check', sql`${table.startsOn} <= ${table.endsOn}`),
    check('sprints_version_check', sql`${table.version} > 0`),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sprintId: uuid('sprint_id'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: varchar('title', { length: 180 }).notNull(),
    description: text('description'),
    status: taskStatus('status').default('TODO').notNull(),
    priority: taskPriority('priority').default('MEDIUM').notNull(),
    position: integer('position').default(0).notNull(),
    dueAt: timestamp('due_at', { mode: 'date', withTimezone: true }),
    version: integer('version').default(1).notNull(),
    ...timestamps(),
  },
  (table) => [
    unique('tasks_identity_unique').on(table.id, table.projectId),
    foreignKey({
      name: 'tasks_sprint_project_fk',
      columns: [table.sprintId, table.projectId],
      foreignColumns: [sprints.id, sprints.projectId],
    }).onDelete('restrict'),
    index('tasks_project_board_idx').on(table.projectId, table.status, table.position),
    index('tasks_sprint_idx').on(table.sprintId),
    check('tasks_title_not_blank_check', sql`length(btrim(${table.title})) > 0`),
    check('tasks_position_check', sql`${table.position} >= 0`),
    check('tasks_version_check', sql`${table.version} > 0`),
  ],
);

export const taskAssignees = pgTable(
  'task_assignees',
  {
    taskId: uuid('task_id').notNull(),
    projectId: uuid('project_id').notNull(),
    userId: uuid('user_id').notNull(),
    assignedAt: timestamp('assigned_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: 'task_assignees_pk', columns: [table.taskId, table.userId] }),
    foreignKey({
      name: 'task_assignees_task_identity_fk',
      columns: [table.taskId, table.projectId],
      foreignColumns: [tasks.id, tasks.projectId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'task_assignees_member_identity_fk',
      columns: [table.projectId, table.userId],
      foreignColumns: [projectMembers.projectId, projectMembers.userId],
    }).onDelete('cascade'),
    index('task_assignees_user_idx').on(table.userId),
  ],
);

export const taskActivities = pgTable(
  'task_activities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    action: varchar('action', { length: 80 }).notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('task_activities_task_created_idx').on(table.taskId, table.createdAt)],
);

export const projectMessages = pgTable(
  'project_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    clientMessageId: uuid('client_message_id').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('project_messages_sender_client_unique').on(table.senderId, table.clientMessageId),
    index('project_messages_project_cursor_idx').on(table.projectId, table.createdAt, table.id),
    check('project_messages_body_check', sql`length(btrim(${table.body})) between 1 and 2000`),
  ],
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    aggregateType: varchar('aggregate_type', { length: 80 }).notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    eventType: varchar('event_type', { length: 120 }).notNull(),
    eventVersion: smallint('event_version').default(1).notNull(),
    routingKey: varchar('routing_key', { length: 160 }).notNull(),
    payload: jsonb('payload').notNull(),
    correlationId: varchar('correlation_id', { length: 100 }).notNull(),
    attempts: integer('attempts').default(0).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    publishedAt: timestamp('published_at', { mode: 'date', withTimezone: true }),
    lastError: text('last_error'),
    occurredAt: timestamp('occurred_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('outbox_events_pending_idx')
      .on(table.nextAttemptAt, table.occurredAt)
      .where(sql`${table.publishedAt} is null`),
    check('outbox_events_version_check', sql`${table.eventVersion} > 0`),
    check('outbox_events_attempts_check', sql`${table.attempts} >= 0`),
    check('outbox_events_type_check', sql`length(btrim(${table.eventType})) > 0`),
    check('outbox_events_routing_key_check', sql`length(btrim(${table.routingKey})) > 0`),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceEventId: uuid('source_event_id').notNull().unique(),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 120 }).notNull(),
    title: varchar('title', { length: 180 }).notNull(),
    body: text('body').notNull(),
    data: jsonb('data').notNull(),
    readAt: timestamp('read_at', { mode: 'date', withTimezone: true }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('notifications_recipient_created_idx').on(table.recipientId, table.createdAt),
    check('notifications_title_check', sql`length(btrim(${table.title})) > 0`),
    check('notifications_body_check', sql`length(btrim(${table.body})) > 0`),
  ],
);

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => notifications.id, { onDelete: 'cascade' }),
    channel: varchar('channel', { length: 40 }).notNull(),
    recipient: varchar('recipient', { length: 320 }).notNull(),
    status: varchar('status', { length: 40 }).default('SIMULATED').notNull(),
    providerMessageId: varchar('provider_message_id', { length: 180 }),
    deliveredAt: timestamp('delivered_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('notification_deliveries_notification_channel_unique').on(
      table.notificationId,
      table.channel,
    ),
    check('notification_deliveries_channel_check', sql`length(btrim(${table.channel})) > 0`),
  ],
);

export const consumerInbox = pgTable(
  'consumer_inbox',
  {
    consumerName: varchar('consumer_name', { length: 120 }).notNull(),
    messageId: uuid('message_id').notNull(),
    processedAt: timestamp('processed_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: 'consumer_inbox_pk',
      columns: [table.consumerName, table.messageId],
    }),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorId: uuid('actor_id'),
    action: varchar('action', { length: 120 }).notNull(),
    targetType: varchar('target_type', { length: 80 }).notNull(),
    targetId: uuid('target_id'),
    requestId: varchar('request_id', { length: 100 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_logs_actor_created_idx').on(table.actorId, table.createdAt),
    index('audit_logs_target_idx').on(table.targetType, table.targetId, table.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectApplication = typeof projectApplications.$inferSelect;
export type NewProjectApplication = typeof projectApplications.$inferInsert;
export type Sprint = typeof sprints.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type ProjectMessage = typeof projectMessages.$inferSelect;
export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
