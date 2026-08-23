import type { DatabasePool, DatabasePoolClient } from '@skillbridge/database';
import { eventTypes, routingKeys, type ApplicationAcceptedData } from '@skillbridge/contracts';

import { conflict, forbidden, notFound } from '../../shared/http/api-error.js';
import { noOpProjectCache, type ProjectCache } from '../cache/project.cache.js';
import { noOpDomainEventPublisher, type DomainEventPublisher } from './domain.events.js';
import type {
  ApplicationCreateInput,
  ApplicationDecisionInput,
  ProfileUpdateInput,
  ProjectCreateInput,
  ProjectListQuery,
  ProjectTransitionInput,
  ProjectUpdateInput,
  SprintCreateInput,
  TaskCreateInput,
  TaskUpdateInput,
  UserSkillsUpdateInput,
} from './domain.schemas.js';

type TransactionClient = DatabasePoolClient;
type QueryClient = DatabasePool | TransactionClient;

type MembershipRole = 'OWNER' | 'LEADER' | 'MEMBER';
type ProjectStatus = 'DRAFT' | 'RECRUITING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED';

const databaseCode = (error: unknown) =>
  error && typeof error === 'object' && 'code' in error ? error.code : undefined;

const withTransaction = async <T>(
  pool: DatabasePool,
  operation: (client: TransactionClient) => Promise<T>,
) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const projectSelection = `
  p.id,
  p.owner_id AS "ownerId",
  p.slug,
  p.title,
  p.description,
  p.status,
  p.capacity,
  p.version,
  p.created_at AS "createdAt",
  p.updated_at AS "updatedAt",
  owner_profile.display_name AS "ownerDisplayName",
  (SELECT count(*)::int FROM project_members pm WHERE pm.project_id = p.id) AS "memberCount",
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'skillId', s.id,
      'slug', s.slug,
      'name', s.name,
      'desiredLevel', prs.desired_level,
      'positions', prs.positions
    ) ORDER BY s.name)
    FROM project_required_skills prs
    JOIN skills s ON s.id = prs.skill_id
    WHERE prs.project_id = p.id
  ), '[]'::jsonb) AS "requiredSkills"`;

const applicationSelection = `
  pa.id,
  pa.project_id AS "projectId",
  pa.applicant_id AS "applicantId",
  pa.cover_letter AS "coverLetter",
  pa.status,
  pa.decided_at AS "decidedAt",
  pa.decided_by AS "decidedBy",
  pa.decision_note AS "decisionNote",
  pa.created_at AS "createdAt",
  pa.updated_at AS "updatedAt"`;

const applicationReturning = `
  id,
  project_id AS "projectId",
  applicant_id AS "applicantId",
  cover_letter AS "coverLetter",
  status,
  decided_at AS "decidedAt",
  decided_by AS "decidedBy",
  decision_note AS "decisionNote",
  created_at AS "createdAt",
  updated_at AS "updatedAt"`;

const taskSelection = `
  t.id,
  t.project_id AS "projectId",
  t.sprint_id AS "sprintId",
  t.created_by AS "createdBy",
  t.title,
  t.description,
  t.status,
  t.priority,
  t.position,
  t.due_at AS "dueAt",
  t.version,
  t.created_at AS "createdAt",
  t.updated_at AS "updatedAt",
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'userId', ta.user_id,
      'displayName', pr.display_name
    ) ORDER BY pr.display_name)
    FROM task_assignees ta
    JOIN profiles pr ON pr.user_id = ta.user_id
    WHERE ta.task_id = t.id
  ), '[]'::jsonb) AS assignees`;

export class DomainService {
  constructor(
    private readonly pool: DatabasePool,
    private readonly events: DomainEventPublisher = noOpDomainEventPublisher,
    private readonly projectCache: ProjectCache = noOpProjectCache,
  ) {}

  async getProfile(userId: string) {
    const profile = await this.pool.query(
      `SELECT p.user_id AS "userId", p.display_name AS "displayName", p.bio, p.university,
              p.major, p.graduation_year AS "graduationYear", p.created_at AS "createdAt",
              p.updated_at AS "updatedAt", u.email, u.global_role AS "globalRole"
       FROM profiles p
       JOIN users u ON u.id = p.user_id
       WHERE p.user_id = $1`,
      [userId],
    );

    if (!profile.rows[0]) {
      throw notFound('PROFILE_NOT_FOUND', 'The profile does not exist.');
    }

    const [skills, links] = await Promise.all([
      this.pool.query(
        `SELECT s.id AS "skillId", s.slug, s.name, us.level
         FROM user_skills us
         JOIN skills s ON s.id = us.skill_id
         WHERE us.user_id = $1
         ORDER BY s.name`,
        [userId],
      ),
      this.pool.query(
        `SELECT id, kind, label, url, position
         FROM portfolio_links
         WHERE user_id = $1
         ORDER BY position, created_at`,
        [userId],
      ),
    ]);

    return { ...profile.rows[0], links: links.rows, skills: skills.rows };
  }

  async updateProfile(userId: string, input: ProfileUpdateInput) {
    const current = await this.getProfile(userId);
    await this.pool.query(
      `UPDATE profiles
       SET display_name = $2, bio = $3, university = $4, major = $5, graduation_year = $6
       WHERE user_id = $1`,
      [
        userId,
        input.displayName ?? current.displayName,
        input.bio === undefined ? current.bio : input.bio,
        input.university ?? current.university,
        input.major === undefined ? current.major : input.major,
        input.graduationYear === undefined ? current.graduationYear : input.graduationYear,
      ],
    );
    return this.getProfile(userId);
  }

  async replaceUserSkills(userId: string, input: UserSkillsUpdateInput) {
    await withTransaction(this.pool, async (client) => {
      if (input.skills.length > 0) {
        const available = await client.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM skills WHERE id = ANY($1::uuid[])',
          [input.skills.map((skill) => skill.skillId)],
        );
        if (available.rows[0]?.count !== input.skills.length) {
          throw notFound('SKILL_NOT_FOUND', 'One or more skills do not exist.');
        }
      }

      await client.query('DELETE FROM user_skills WHERE user_id = $1', [userId]);
      for (const skill of input.skills) {
        await client.query(
          'INSERT INTO user_skills (user_id, skill_id, level) VALUES ($1, $2, $3)',
          [userId, skill.skillId, skill.level],
        );
      }
    });
    return this.getProfile(userId);
  }

  async listSkills() {
    const result = await this.pool.query('SELECT id, slug, name FROM skills ORDER BY name');
    return result.rows;
  }

  async listProjects(query: ProjectListQuery) {
    const cached = await this.projectCache.getList<{
      items: unknown[];
      page: number;
      pageSize: number;
      total: number;
    }>(query);
    if (cached) return cached;
    const search = query.search ? `%${query.search}%` : null;
    const skill = query.skill ?? null;
    const offset = (query.page - 1) * query.limit;
    const parameters = [query.status, search, skill, query.limit, offset];
    const filter = `
      p.status = $1
      AND ($2::text IS NULL OR p.title ILIKE $2 OR p.description ILIKE $2)
      AND ($3::text IS NULL OR EXISTS (
        SELECT 1 FROM project_required_skills filter_prs
        JOIN skills filter_skill ON filter_skill.id = filter_prs.skill_id
        WHERE filter_prs.project_id = p.id AND filter_skill.slug = $3
      ))`;
    const [items, count] = await Promise.all([
      this.pool.query(
        `SELECT ${projectSelection}
         FROM projects p
         JOIN profiles owner_profile ON owner_profile.user_id = p.owner_id
         WHERE ${filter}
         ORDER BY p.created_at DESC, p.id DESC
         LIMIT $4 OFFSET $5`,
        parameters,
      ),
      this.pool.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM projects p WHERE ${filter}`,
        parameters.slice(0, 3),
      ),
    ]);

    const projects = {
      items: items.rows,
      page: query.page,
      pageSize: query.limit,
      total: count.rows[0]?.total ?? 0,
    };
    await this.projectCache.setList(query, projects);
    return projects;
  }

  async getProjectBySlug(slug: string) {
    const cached = await this.projectCache.getDetail<Record<string, unknown>>(slug);
    if (cached) return cached;
    const result = await this.pool.query(
      `SELECT ${projectSelection}
       FROM projects p
       JOIN profiles owner_profile ON owner_profile.user_id = p.owner_id
       WHERE p.slug = $1 AND p.status IN ('RECRUITING', 'ACTIVE', 'COMPLETED')`,
      [slug],
    );
    if (!result.rows[0]) {
      throw notFound('PROJECT_NOT_FOUND', 'The project does not exist.');
    }
    await this.projectCache.setDetail(slug, result.rows[0]);
    return result.rows[0];
  }

  async createProject(ownerId: string, input: ProjectCreateInput) {
    try {
      const projectId = await withTransaction(this.pool, async (client) => {
        const created = await client.query<{ id: string }>(
          `INSERT INTO projects (owner_id, slug, title, description, capacity)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [ownerId, input.slug, input.title, input.description, input.capacity],
        );
        const id = created.rows[0]!.id;
        await this.replaceRequiredSkills(client, id, input.requiredSkills);
        return id;
      });
      const project = await this.getProjectForManager(projectId, ownerId);
      await this.projectCache.invalidateProjects();
      return project;
    } catch (error) {
      if (databaseCode(error) === '23505') {
        throw conflict('PROJECT_SLUG_ALREADY_EXISTS', 'A project with this slug already exists.');
      }
      throw error;
    }
  }

  async updateProject(projectId: string, ownerId: string, input: ProjectUpdateInput) {
    await withTransaction(this.pool, async (client) => {
      const current = await client.query<{
        capacity: number;
        description: string;
        ownerId: string;
        title: string;
        version: number;
      }>(
        `SELECT owner_id AS "ownerId", title, description, capacity, version
         FROM projects WHERE id = $1 FOR UPDATE`,
        [projectId],
      );
      const project = current.rows[0];
      if (!project) {
        throw notFound('PROJECT_NOT_FOUND', 'The project does not exist.');
      }
      if (project.ownerId !== ownerId) {
        throw forbidden('PROJECT_FORBIDDEN', 'Only the project owner can edit this project.');
      }
      if (project.version !== input.version) {
        throw conflict('PROJECT_VERSION_CONFLICT', 'The project was changed by another request.');
      }

      const capacity = input.capacity ?? project.capacity;
      const members = await client.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM project_members WHERE project_id = $1',
        [projectId],
      );
      if ((members.rows[0]?.count ?? 0) > capacity) {
        throw conflict('PROJECT_CAPACITY_BELOW_TEAM_SIZE', 'Capacity cannot be below team size.');
      }

      await client.query(
        `UPDATE projects
         SET title = $2, description = $3, capacity = $4, version = version + 1
         WHERE id = $1`,
        [
          projectId,
          input.title ?? project.title,
          input.description ?? project.description,
          capacity,
        ],
      );
      if (input.requiredSkills) {
        await this.replaceRequiredSkills(client, projectId, input.requiredSkills);
      }
    });
    const project = await this.getProjectForManager(projectId, ownerId);
    await this.projectCache.invalidateProjects();
    return project;
  }

  async transitionProject(projectId: string, ownerId: string, input: ProjectTransitionInput) {
    const transitions: Record<
      ProjectTransitionInput['action'],
      { from: ProjectStatus[]; to: ProjectStatus }
    > = {
      ARCHIVE: { from: ['COMPLETED', 'CANCELLED'], to: 'ARCHIVED' },
      CANCEL: { from: ['RECRUITING', 'ACTIVE'], to: 'CANCELLED' },
      COMPLETE: { from: ['ACTIVE'], to: 'COMPLETED' },
      PUBLISH: { from: ['DRAFT'], to: 'RECRUITING' },
      START: { from: ['RECRUITING'], to: 'ACTIVE' },
    };
    const transition = transitions[input.action];
    const result = await this.pool.query(
      `UPDATE projects
       SET status = $4, version = version + 1
       WHERE id = $1 AND owner_id = $2 AND version = $3 AND status = ANY($5::project_status[])
       RETURNING id`,
      [projectId, ownerId, input.version, transition.to, transition.from],
    );
    if (!result.rows[0]) {
      const current = await this.pool.query<{
        ownerId: string;
        status: ProjectStatus;
        version: number;
      }>('SELECT owner_id AS "ownerId", status, version FROM projects WHERE id = $1', [projectId]);
      if (!current.rows[0]) {
        throw notFound('PROJECT_NOT_FOUND', 'The project does not exist.');
      }
      if (current.rows[0].ownerId !== ownerId) {
        throw forbidden('PROJECT_FORBIDDEN', 'Only the project owner can change lifecycle state.');
      }
      if (current.rows[0].version !== input.version) {
        throw conflict('PROJECT_VERSION_CONFLICT', 'The project was changed by another request.');
      }
      throw conflict(
        'PROJECT_TRANSITION_INVALID',
        `The ${input.action.toLowerCase()} transition is invalid from ${current.rows[0].status}.`,
      );
    }
    const project = await this.getProjectForManager(projectId, ownerId);
    await this.projectCache.invalidateProjects();
    return project;
  }

  async listMembers(projectId: string, userId: string) {
    await this.requireMember(this.pool, projectId, userId);
    const result = await this.pool.query(
      `SELECT pm.user_id AS "userId", pm.project_role AS "projectRole", pm.joined_at AS "joinedAt",
              p.display_name AS "displayName", u.email
       FROM project_members pm
       JOIN profiles p ON p.user_id = pm.user_id
       JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = $1
       ORDER BY CASE pm.project_role WHEN 'OWNER' THEN 1 WHEN 'LEADER' THEN 2 ELSE 3 END,
                pm.joined_at`,
      [projectId],
    );
    return result.rows;
  }

  async submitApplication(projectId: string, applicantId: string, input: ApplicationCreateInput) {
    try {
      return await withTransaction(this.pool, async (client) => {
        const project = await client.query<{ ownerId: string; status: ProjectStatus }>(
          'SELECT owner_id AS "ownerId", status FROM projects WHERE id = $1 FOR SHARE',
          [projectId],
        );
        if (!project.rows[0]) {
          throw notFound('PROJECT_NOT_FOUND', 'The project does not exist.');
        }
        if (project.rows[0].status !== 'RECRUITING') {
          throw conflict('PROJECT_NOT_RECRUITING', 'This project is not accepting applications.');
        }
        if (project.rows[0].ownerId === applicantId) {
          throw conflict('APPLICATION_OWNER_FORBIDDEN', 'The project owner cannot apply.');
        }
        const membership = await client.query(
          'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
          [projectId, applicantId],
        );
        if (membership.rows[0]) {
          throw conflict('APPLICATION_MEMBER_FORBIDDEN', 'Project members cannot apply.');
        }
        const created = await client.query(
          `INSERT INTO project_applications (project_id, applicant_id, cover_letter)
           VALUES ($1, $2, $3)
           RETURNING ${applicationReturning}`,
          [projectId, applicantId, input.coverLetter],
        );
        return created.rows[0];
      });
    } catch (error) {
      if (databaseCode(error) === '23505') {
        throw conflict('APPLICATION_ALREADY_PENDING', 'A pending application already exists.');
      }
      throw error;
    }
  }

  async listMyApplications(applicantId: string) {
    const result = await this.pool.query(
      `SELECT ${applicationSelection}, p.slug AS "projectSlug", p.title AS "projectTitle"
       FROM project_applications pa
       JOIN projects p ON p.id = pa.project_id
       WHERE pa.applicant_id = $1
       ORDER BY pa.created_at DESC`,
      [applicantId],
    );
    return result.rows;
  }

  async withdrawApplication(applicationId: string, applicantId: string) {
    const result = await this.pool.query(
      `UPDATE project_applications
       SET status = 'WITHDRAWN', decided_at = now()
       WHERE id = $1 AND applicant_id = $2 AND status = 'PENDING'
       RETURNING ${applicationReturning}`,
      [applicationId, applicantId],
    );
    if (!result.rows[0]) {
      throw conflict(
        'APPLICATION_WITHDRAW_INVALID',
        'Only a pending application owned by this user can be withdrawn.',
      );
    }
    return result.rows[0];
  }

  async listProjectApplications(projectId: string, managerId: string) {
    await this.requireMember(this.pool, projectId, managerId, ['OWNER', 'LEADER']);
    const result = await this.pool.query(
      `SELECT ${applicationSelection}, pr.display_name AS "applicantDisplayName", u.email
       FROM project_applications pa
       JOIN profiles pr ON pr.user_id = pa.applicant_id
       JOIN users u ON u.id = pa.applicant_id
       WHERE pa.project_id = $1
       ORDER BY pa.created_at DESC`,
      [projectId],
    );
    return result.rows;
  }

  async decideApplication(
    applicationId: string,
    managerId: string,
    input: ApplicationDecisionInput,
    correlationId: string,
  ) {
    const decision = await withTransaction(this.pool, async (client) => {
      const application = await client.query<{
        applicantId: string;
        capacity: number;
        projectId: string;
        projectTitle: string;
        recipientEmail: string;
        status: string;
      }>(
        `SELECT pa.project_id AS "projectId", pa.applicant_id AS "applicantId", pa.status,
                p.capacity, p.title AS "projectTitle", u.email AS "recipientEmail"
         FROM project_applications pa
         JOIN projects p ON p.id = pa.project_id
         JOIN users u ON u.id = pa.applicant_id
         WHERE pa.id = $1
         FOR UPDATE OF p, pa`,
        [applicationId],
      );
      const record = application.rows[0];
      if (!record) {
        throw notFound('APPLICATION_NOT_FOUND', 'The application does not exist.');
      }
      await this.requireMember(client, record.projectId, managerId, ['OWNER', 'LEADER']);
      if (record.status !== 'PENDING') {
        throw conflict('APPLICATION_ALREADY_PROCESSED', 'The application is no longer pending.');
      }

      if (input.decision === 'ACCEPTED') {
        const members = await client.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM project_members WHERE project_id = $1',
          [record.projectId],
        );
        if ((members.rows[0]?.count ?? 0) >= record.capacity) {
          throw conflict('PROJECT_CAPACITY_REACHED', 'The project has reached its capacity.');
        }
      }

      const decided = await client.query(
        `UPDATE project_applications
         SET status = $2, decided_at = now(), decided_by = $3, decision_note = $4
         WHERE id = $1
         RETURNING ${applicationReturning}`,
        [applicationId, input.decision, managerId, input.note ?? null],
      );
      if (input.decision === 'ACCEPTED') {
        await client.query(
          `INSERT INTO project_members (project_id, user_id, project_role, source_application_id)
           VALUES ($1, $2, 'MEMBER', $3)`,
          [record.projectId, record.applicantId, applicationId],
        );
        const payload: ApplicationAcceptedData = {
          applicantId: record.applicantId,
          applicationId,
          managerId,
          projectId: record.projectId,
          projectTitle: record.projectTitle,
          recipientEmail: record.recipientEmail,
        };
        await client.query(
          `INSERT INTO outbox_events
             (aggregate_type, aggregate_id, event_type, event_version, routing_key, payload,
              correlation_id)
           VALUES ('PROJECT_APPLICATION', $1, $2, 1, $3, $4::jsonb, $5)`,
          [
            applicationId,
            eventTypes.applicationAccepted,
            routingKeys.applicationAccepted,
            JSON.stringify(payload),
            correlationId,
          ],
        );
      }
      return decided.rows[0];
    });
    if (input.decision === 'ACCEPTED') await this.projectCache.invalidateProjects();
    return decision;
  }

  async createSprint(projectId: string, userId: string, input: SprintCreateInput) {
    await this.requireMember(this.pool, projectId, userId, ['OWNER', 'LEADER']);
    const result = await this.pool.query(
      `INSERT INTO sprints (project_id, name, goal, starts_on, ends_on)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, project_id AS "projectId", name, goal, starts_on AS "startsOn",
                 ends_on AS "endsOn", status, version, created_at AS "createdAt"`,
      [projectId, input.name, input.goal ?? null, input.startsOn, input.endsOn],
    );
    return result.rows[0];
  }

  async listSprints(projectId: string, userId: string) {
    await this.requireMember(this.pool, projectId, userId);
    const result = await this.pool.query(
      `SELECT id, project_id AS "projectId", name, goal, starts_on AS "startsOn",
              ends_on AS "endsOn", status, version, created_at AS "createdAt",
              updated_at AS "updatedAt"
       FROM sprints WHERE project_id = $1 ORDER BY starts_on DESC, created_at DESC`,
      [projectId],
    );
    return result.rows;
  }

  async createTask(projectId: string, userId: string, input: TaskCreateInput) {
    const task = await withTransaction(this.pool, async (client) => {
      await this.requireMember(client, projectId, userId);
      await this.validateAssignees(client, projectId, input.assigneeIds);
      await this.validateSprint(client, projectId, input.sprintId);
      const result = await client.query<{ id: string }>(
        `INSERT INTO tasks
           (project_id, sprint_id, created_by, title, description, priority, position, due_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          projectId,
          input.sprintId ?? null,
          userId,
          input.title,
          input.description ?? null,
          input.priority,
          input.position,
          input.dueAt ?? null,
        ],
      );
      const taskId = result.rows[0]!.id;
      await this.replaceAssignees(client, taskId, projectId, input.assigneeIds);
      await client.query(
        `INSERT INTO task_activities (task_id, actor_id, action, after)
         VALUES ($1, $2, 'TASK_CREATED', jsonb_build_object('title', $3::text))`,
        [taskId, userId, input.title],
      );
      return this.getTask(client, taskId);
    });
    this.events.publish({ action: 'CREATED', actorId: userId, task, type: 'task.changed' });
    return task;
  }

  async listTasks(projectId: string, userId: string) {
    await this.requireMember(this.pool, projectId, userId);
    const result = await this.pool.query(
      `SELECT ${taskSelection}
       FROM tasks t
       WHERE t.project_id = $1
       ORDER BY t.status, t.position, t.created_at`,
      [projectId],
    );
    return result.rows;
  }

  async updateTask(taskId: string, userId: string, input: TaskUpdateInput) {
    const task = await withTransaction(this.pool, async (client) => {
      const currentResult = await client.query<{
        description: string | null;
        dueAt: Date | null;
        position: number;
        priority: string;
        projectId: string;
        sprintId: string | null;
        status: string;
        title: string;
        version: number;
      }>(
        `SELECT project_id AS "projectId", sprint_id AS "sprintId", title, description, status,
                priority, position, due_at AS "dueAt", version
         FROM tasks WHERE id = $1 FOR UPDATE`,
        [taskId],
      );
      const current = currentResult.rows[0];
      if (!current) {
        throw notFound('TASK_NOT_FOUND', 'The task does not exist.');
      }
      await this.requireMember(client, current.projectId, userId);
      if (current.version !== input.version) {
        throw conflict('TASK_VERSION_CONFLICT', 'The task was changed by another request.');
      }
      if (input.assigneeIds) {
        await this.validateAssignees(client, current.projectId, input.assigneeIds);
      }
      await this.validateSprint(client, current.projectId, input.sprintId);

      await client.query(
        `UPDATE tasks
         SET sprint_id = $2, title = $3, description = $4, status = $5, priority = $6,
             position = $7, due_at = $8, version = version + 1
         WHERE id = $1`,
        [
          taskId,
          input.sprintId ?? current.sprintId,
          input.title ?? current.title,
          input.description ?? current.description,
          input.status ?? current.status,
          input.priority ?? current.priority,
          input.position ?? current.position,
          input.dueAt ?? current.dueAt,
        ],
      );
      if (input.assigneeIds) {
        await this.replaceAssignees(client, taskId, current.projectId, input.assigneeIds);
      }
      const updated = await this.getTask(client, taskId);
      await client.query(
        `INSERT INTO task_activities (task_id, actor_id, action, before, after)
         VALUES ($1, $2, 'TASK_UPDATED', $3::jsonb, $4::jsonb)`,
        [taskId, userId, JSON.stringify(current), JSON.stringify(updated)],
      );
      return updated;
    });
    this.events.publish({ action: 'UPDATED', actorId: userId, task, type: 'task.changed' });
    return task;
  }

  async updateAccountStatus(
    targetUserId: string,
    status: 'ACTIVE' | 'SUSPENDED',
    actorId: string,
    requestId: string,
  ) {
    return withTransaction(this.pool, async (client) => {
      if (targetUserId === actorId && status === 'SUSPENDED') {
        throw conflict(
          'ADMIN_SELF_SUSPEND_FORBIDDEN',
          'An admin cannot suspend their own account.',
        );
      }
      const updated = await client.query(
        `UPDATE users SET status = $2 WHERE id = $1
         RETURNING id, email, global_role AS "globalRole", status, updated_at AS "updatedAt"`,
        [targetUserId, status],
      );
      if (!updated.rows[0]) {
        throw notFound('USER_NOT_FOUND', 'The user does not exist.');
      }
      await client.query(
        `INSERT INTO audit_logs
           (actor_id, action, target_type, target_id, request_id, metadata)
         VALUES ($1, 'USER_STATUS_CHANGED', 'USER', $2, $3,
                 jsonb_build_object('status', $4::text))`,
        [actorId, targetUserId, requestId, status],
      );
      return updated.rows[0];
    });
  }

  async listAuditLogs(limit: number) {
    const result = await this.pool.query(
      `SELECT id, actor_id AS "actorId", action, target_type AS "targetType",
              target_id AS "targetId", request_id AS "requestId", metadata,
              created_at AS "createdAt"
       FROM audit_logs ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  private async replaceRequiredSkills(
    client: TransactionClient,
    projectId: string,
    requiredSkills: ProjectCreateInput['requiredSkills'],
  ) {
    if (requiredSkills.length > 0) {
      const available = await client.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM skills WHERE id = ANY($1::uuid[])',
        [requiredSkills.map((skill) => skill.skillId)],
      );
      if (available.rows[0]?.count !== requiredSkills.length) {
        throw notFound('SKILL_NOT_FOUND', 'One or more required skills do not exist.');
      }
    }
    await client.query('DELETE FROM project_required_skills WHERE project_id = $1', [projectId]);
    for (const skill of requiredSkills) {
      await client.query(
        `INSERT INTO project_required_skills (project_id, skill_id, desired_level, positions)
         VALUES ($1, $2, $3, $4)`,
        [projectId, skill.skillId, skill.desiredLevel, skill.positions],
      );
    }
  }

  async getProjectForManager(projectId: string, managerId: string) {
    const result = await this.pool.query(
      `SELECT ${projectSelection}
       FROM projects p
       JOIN profiles owner_profile ON owner_profile.user_id = p.owner_id
       WHERE p.id = $1 AND p.owner_id = $2`,
      [projectId, managerId],
    );
    if (!result.rows[0]) {
      throw notFound('PROJECT_NOT_FOUND', 'The project does not exist.');
    }
    return result.rows[0];
  }

  private async requireMember(
    client: QueryClient,
    projectId: string,
    userId: string,
    allowedRoles?: MembershipRole[],
  ) {
    const result = await client.query<{ projectRole: MembershipRole }>(
      `SELECT project_role AS "projectRole"
       FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, userId],
    );
    const membership = result.rows[0];
    if (!membership || (allowedRoles && !allowedRoles.includes(membership.projectRole))) {
      throw forbidden(
        'PROJECT_MEMBERSHIP_REQUIRED',
        'Project membership does not grant this action.',
      );
    }
    return membership;
  }

  private async validateAssignees(
    client: TransactionClient,
    projectId: string,
    assigneeIds: string[],
  ) {
    if (assigneeIds.length === 0) return;
    const members = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM project_members WHERE project_id = $1 AND user_id = ANY($2::uuid[])`,
      [projectId, assigneeIds],
    );
    if (members.rows[0]?.count !== assigneeIds.length) {
      throw conflict('TASK_ASSIGNEE_NOT_MEMBER', 'Every task assignee must be a project member.');
    }
  }

  private async validateSprint(
    client: TransactionClient,
    projectId: string,
    sprintId: string | undefined,
  ) {
    if (!sprintId) return;
    const sprint = await client.query('SELECT 1 FROM sprints WHERE id = $1 AND project_id = $2', [
      sprintId,
      projectId,
    ]);
    if (!sprint.rows[0]) {
      throw conflict('TASK_SPRINT_INVALID', 'The sprint does not belong to this project.');
    }
  }

  private async replaceAssignees(
    client: TransactionClient,
    taskId: string,
    projectId: string,
    assigneeIds: string[],
  ) {
    await client.query('DELETE FROM task_assignees WHERE task_id = $1', [taskId]);
    for (const assigneeId of assigneeIds) {
      await client.query(
        'INSERT INTO task_assignees (task_id, project_id, user_id) VALUES ($1, $2, $3)',
        [taskId, projectId, assigneeId],
      );
    }
  }

  private async getTask(client: QueryClient, taskId: string) {
    const result = await client.query(`SELECT ${taskSelection} FROM tasks t WHERE t.id = $1`, [
      taskId,
    ]);
    if (!result.rows[0]) {
      throw notFound('TASK_NOT_FOUND', 'The task does not exist.');
    }
    return result.rows[0];
  }
}
