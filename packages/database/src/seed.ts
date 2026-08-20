import type { DatabaseClient } from './client.js';
import {
  portfolioLinks,
  profiles,
  projectApplications,
  projectMembers,
  projectRequiredSkills,
  projects,
  skills,
  sprints,
  taskAssignees,
  tasks,
  users,
  userSkills,
} from './schema.js';

const seedIds = {
  owner: '00000000-0000-4000-8000-000000000001',
  applicant: '00000000-0000-4000-8000-000000000002',
  react: '00000000-0000-4000-8000-000000000101',
  typescript: '00000000-0000-4000-8000-000000000102',
  postgresql: '00000000-0000-4000-8000-000000000103',
  project: '00000000-0000-4000-8000-000000000201',
  application: '00000000-0000-4000-8000-000000000301',
  portfolio: '00000000-0000-4000-8000-000000000401',
  sprint: '00000000-0000-4000-8000-000000000501',
  task: '00000000-0000-4000-8000-000000000601',
} as const;

const disabledSeedPasswordHash = '!seed-account-login-disabled!';

export const seedDatabase = async (database: DatabaseClient) => {
  await database.transaction(async (transaction) => {
    await transaction
      .insert(users)
      .values([
        {
          id: seedIds.owner,
          email: 'owner@skillbridge.local',
          passwordHash: disabledSeedPasswordHash,
          emailVerifiedAt: new Date('2026-08-20T00:00:00.000Z'),
        },
        {
          id: seedIds.applicant,
          email: 'applicant@skillbridge.local',
          passwordHash: disabledSeedPasswordHash,
          emailVerifiedAt: new Date('2026-08-20T00:00:00.000Z'),
        },
      ])
      .onConflictDoUpdate({
        target: users.email,
        set: {
          status: 'ACTIVE',
          updatedAt: new Date(),
        },
      });

    await transaction
      .insert(profiles)
      .values([
        {
          userId: seedIds.owner,
          displayName: 'Nguyen Minh Anh',
          major: 'Computer Science',
          graduationYear: 2028,
          bio: 'Project owner building practical products with HCMUT students.',
        },
        {
          userId: seedIds.applicant,
          displayName: 'Tran Gia Bao',
          major: 'Computer Engineering',
          graduationYear: 2028,
          bio: 'Student developer focused on TypeScript and PostgreSQL.',
        },
      ])
      .onConflictDoUpdate({
        target: profiles.userId,
        set: {
          updatedAt: new Date(),
        },
      });

    await transaction
      .insert(portfolioLinks)
      .values({
        id: seedIds.portfolio,
        userId: seedIds.applicant,
        kind: 'GITHUB',
        label: 'GitHub',
        url: 'https://github.com/tranbaoanh21',
      })
      .onConflictDoNothing();

    await transaction
      .insert(skills)
      .values([
        { id: seedIds.react, slug: 'react', name: 'React' },
        { id: seedIds.typescript, slug: 'typescript', name: 'TypeScript' },
        { id: seedIds.postgresql, slug: 'postgresql', name: 'PostgreSQL' },
      ])
      .onConflictDoNothing();

    await transaction
      .insert(userSkills)
      .values([
        { userId: seedIds.owner, skillId: seedIds.react, level: 4 },
        { userId: seedIds.owner, skillId: seedIds.typescript, level: 4 },
        { userId: seedIds.applicant, skillId: seedIds.postgresql, level: 3 },
      ])
      .onConflictDoUpdate({
        target: [userSkills.userId, userSkills.skillId],
        set: { level: 4 },
      });

    await transaction
      .insert(projects)
      .values({
        id: seedIds.project,
        ownerId: seedIds.owner,
        slug: 'hcmut-skillbridge-demo',
        title: 'HCMUT SkillBridge Demo',
        description: 'A seeded project for local development and database query verification.',
        status: 'RECRUITING',
        capacity: 5,
      })
      .onConflictDoUpdate({
        target: projects.slug,
        set: {
          description: 'A seeded project for local development and database query verification.',
          status: 'RECRUITING',
          capacity: 5,
        },
      });

    await transaction
      .insert(projectRequiredSkills)
      .values([
        {
          projectId: seedIds.project,
          skillId: seedIds.react,
          desiredLevel: 3,
          positions: 2,
        },
        {
          projectId: seedIds.project,
          skillId: seedIds.postgresql,
          desiredLevel: 2,
          positions: 1,
        },
      ])
      .onConflictDoNothing();

    await transaction
      .insert(projectApplications)
      .values({
        id: seedIds.application,
        projectId: seedIds.project,
        applicantId: seedIds.applicant,
        coverLetter: 'I want to contribute to the API and PostgreSQL design.',
        status: 'ACCEPTED',
        decidedAt: new Date('2026-08-20T00:30:00.000Z'),
        decidedBy: seedIds.owner,
        decisionNote: 'Accepted seed application.',
      })
      .onConflictDoNothing();

    await transaction
      .insert(projectMembers)
      .values({
        projectId: seedIds.project,
        userId: seedIds.applicant,
        projectRole: 'MEMBER',
        sourceApplicationId: seedIds.application,
      })
      .onConflictDoNothing();

    await transaction
      .insert(sprints)
      .values({
        endsOn: '2026-09-07',
        goal: 'Deliver the first usable project discovery and application flow.',
        id: seedIds.sprint,
        name: 'MVP Sprint 1',
        projectId: seedIds.project,
        startsOn: '2026-09-01',
      })
      .onConflictDoNothing();

    await transaction
      .insert(tasks)
      .values({
        createdBy: seedIds.owner,
        description: 'Implement responsive cards, search, and loading/error states.',
        id: seedIds.task,
        position: 0,
        priority: 'HIGH',
        projectId: seedIds.project,
        sprintId: seedIds.sprint,
        title: 'Build project discovery page',
      })
      .onConflictDoNothing();

    await transaction
      .insert(taskAssignees)
      .values({
        projectId: seedIds.project,
        taskId: seedIds.task,
        userId: seedIds.applicant,
      })
      .onConflictDoNothing();
  });
};
