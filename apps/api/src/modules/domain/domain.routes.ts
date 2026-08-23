import { Router } from 'express';

import { authenticate, requireGlobalRole } from '../auth/auth.middleware.js';
import type { TokenService } from '../auth/token.service.js';
import {
  accountStatusSchema,
  applicationCreateSchema,
  applicationDecisionSchema,
  applicationIdParamSchema,
  idParamSchema,
  profileUpdateSchema,
  projectCreateSchema,
  projectIdParamSchema,
  projectListQuerySchema,
  projectTransitionSchema,
  projectUpdateSchema,
  slugParamSchema,
  sprintCreateSchema,
  taskCreateSchema,
  taskIdParamSchema,
  taskUpdateSchema,
  userSkillsUpdateSchema,
} from './domain.schemas.js';
import { DomainService } from './domain.service.js';

const authenticatedUserId = (request: { auth?: { id: string } }) => request.auth!.id;

export const createDomainRouter = (service: DomainService, tokenService: TokenService) => {
  const router = Router();
  const requireAuthentication = authenticate(tokenService);

  router.get('/skills', async (_request, response) => {
    response.status(200).json({ data: { skills: await service.listSkills() } });
  });

  router.get('/profile', requireAuthentication, async (request, response) => {
    response
      .status(200)
      .json({ data: { profile: await service.getProfile(authenticatedUserId(request)) } });
  });

  router.put('/profile', requireAuthentication, async (request, response) => {
    const profile = await service.updateProfile(
      authenticatedUserId(request),
      profileUpdateSchema.parse(request.body),
    );
    response.status(200).json({ data: { profile } });
  });

  router.put('/profile/skills', requireAuthentication, async (request, response) => {
    const profile = await service.replaceUserSkills(
      authenticatedUserId(request),
      userSkillsUpdateSchema.parse(request.body),
    );
    response.status(200).json({ data: { profile } });
  });

  router.get('/projects', async (request, response) => {
    response
      .status(200)
      .json({ data: await service.listProjects(projectListQuerySchema.parse(request.query)) });
  });

  router.get('/projects/:id/manage', requireAuthentication, async (request, response) => {
    const { id } = idParamSchema.parse(request.params);
    const project = await service.getProjectForManager(id, authenticatedUserId(request));
    response.status(200).json({ data: { project } });
  });

  router.get('/projects/:slug', async (request, response) => {
    const { slug } = slugParamSchema.parse(request.params);
    response.status(200).json({ data: { project: await service.getProjectBySlug(slug) } });
  });

  router.post('/projects', requireAuthentication, async (request, response) => {
    const project = await service.createProject(
      authenticatedUserId(request),
      projectCreateSchema.parse(request.body),
    );
    response.status(201).json({ data: { project } });
  });

  router.patch('/projects/:id', requireAuthentication, async (request, response) => {
    const { id } = idParamSchema.parse(request.params);
    const project = await service.updateProject(
      id,
      authenticatedUserId(request),
      projectUpdateSchema.parse(request.body),
    );
    response.status(200).json({ data: { project } });
  });

  router.post('/projects/:id/transitions', requireAuthentication, async (request, response) => {
    const { id } = idParamSchema.parse(request.params);
    const project = await service.transitionProject(
      id,
      authenticatedUserId(request),
      projectTransitionSchema.parse(request.body),
    );
    response.status(200).json({ data: { project } });
  });

  router.get('/projects/:projectId/members', requireAuthentication, async (request, response) => {
    const { projectId } = projectIdParamSchema.parse(request.params);
    const members = await service.listMembers(projectId, authenticatedUserId(request));
    response.status(200).json({ data: { members } });
  });

  router.post(
    '/projects/:projectId/applications',
    requireAuthentication,
    async (request, response) => {
      const { projectId } = projectIdParamSchema.parse(request.params);
      const application = await service.submitApplication(
        projectId,
        authenticatedUserId(request),
        applicationCreateSchema.parse(request.body),
      );
      response.status(201).json({ data: { application } });
    },
  );

  router.get('/applications/me', requireAuthentication, async (request, response) => {
    const applications = await service.listMyApplications(authenticatedUserId(request));
    response.status(200).json({ data: { applications } });
  });

  router.post(
    '/applications/:applicationId/withdraw',
    requireAuthentication,
    async (request, response) => {
      const { applicationId } = applicationIdParamSchema.parse(request.params);
      const application = await service.withdrawApplication(
        applicationId,
        authenticatedUserId(request),
      );
      response.status(200).json({ data: { application } });
    },
  );

  router.get(
    '/projects/:projectId/applications',
    requireAuthentication,
    async (request, response) => {
      const { projectId } = projectIdParamSchema.parse(request.params);
      const applications = await service.listProjectApplications(
        projectId,
        authenticatedUserId(request),
      );
      response.status(200).json({ data: { applications } });
    },
  );

  router.post(
    '/applications/:applicationId/decision',
    requireAuthentication,
    async (request, response) => {
      const { applicationId } = applicationIdParamSchema.parse(request.params);
      const application = await service.decideApplication(
        applicationId,
        authenticatedUserId(request),
        applicationDecisionSchema.parse(request.body),
        String(request.id),
      );
      response.status(200).json({ data: { application } });
    },
  );

  router.post('/projects/:projectId/sprints', requireAuthentication, async (request, response) => {
    const { projectId } = projectIdParamSchema.parse(request.params);
    const sprint = await service.createSprint(
      projectId,
      authenticatedUserId(request),
      sprintCreateSchema.parse(request.body),
    );
    response.status(201).json({ data: { sprint } });
  });

  router.get('/projects/:projectId/sprints', requireAuthentication, async (request, response) => {
    const { projectId } = projectIdParamSchema.parse(request.params);
    const sprints = await service.listSprints(projectId, authenticatedUserId(request));
    response.status(200).json({ data: { sprints } });
  });

  router.post('/projects/:projectId/tasks', requireAuthentication, async (request, response) => {
    const { projectId } = projectIdParamSchema.parse(request.params);
    const task = await service.createTask(
      projectId,
      authenticatedUserId(request),
      taskCreateSchema.parse(request.body),
    );
    response.status(201).json({ data: { task } });
  });

  router.get('/projects/:projectId/tasks', requireAuthentication, async (request, response) => {
    const { projectId } = projectIdParamSchema.parse(request.params);
    const tasks = await service.listTasks(projectId, authenticatedUserId(request));
    response.status(200).json({ data: { tasks } });
  });

  router.patch('/tasks/:taskId', requireAuthentication, async (request, response) => {
    const { taskId } = taskIdParamSchema.parse(request.params);
    const task = await service.updateTask(
      taskId,
      authenticatedUserId(request),
      taskUpdateSchema.parse(request.body),
    );
    response.status(200).json({ data: { task } });
  });

  router.patch(
    '/admin/users/:id/status',
    requireAuthentication,
    requireGlobalRole('ADMIN'),
    async (request, response) => {
      const { id } = idParamSchema.parse(request.params);
      const { status } = accountStatusSchema.parse(request.body);
      const user = await service.updateAccountStatus(
        id,
        status,
        authenticatedUserId(request),
        String(request.id),
      );
      response.status(200).json({ data: { user } });
    },
  );

  router.get(
    '/admin/audit-logs',
    requireAuthentication,
    requireGlobalRole('ADMIN'),
    async (request, response) => {
      const limit = Math.min(Math.max(Number(request.query['limit']) || 50, 1), 100);
      response.status(200).json({ data: { auditLogs: await service.listAuditLogs(limit) } });
    },
  );

  return router;
};
