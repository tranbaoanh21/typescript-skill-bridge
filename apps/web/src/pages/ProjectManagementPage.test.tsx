import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectManagementPage } from './ProjectManagementPage';

const project = {
  capacity: 4,
  createdAt: '2026-08-24T00:00:00.000Z',
  description: 'A detailed project brief for the owner management component test.',
  id: '11111111-1111-4111-8111-111111111111',
  memberCount: 1,
  ownerDisplayName: 'Project Owner',
  ownerId: '22222222-2222-4222-8222-222222222222',
  requiredSkills: [],
  slug: 'owner-project',
  status: 'RECRUITING' as const,
  title: 'Owner Project',
  updatedAt: '2026-08-24T00:00:00.000Z',
  version: 2,
};

const application = {
  applicantDisplayName: 'Student Candidate',
  applicantId: '33333333-3333-4333-8333-333333333333',
  coverLetter: 'I can own the React discovery flow and document the implementation decisions.',
  createdAt: '2026-08-24T00:00:00.000Z',
  decisionNote: null,
  email: 'candidate@example.com',
  id: '44444444-4444-4444-8444-444444444444',
  projectId: project.id,
  status: 'PENDING' as const,
};

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/projects/manage/${project.id}`]}>
        <Routes>
          <Route element={<ProjectManagementPage />} path="/projects/manage/:projectId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('ProjectManagementPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        const method = init?.method ?? 'GET';
        if (url.endsWith('/applications') && method === 'GET') {
          return new Response(JSON.stringify({ data: { applications: [application] } }), {
            status: 200,
          });
        }
        if (url.endsWith('/manage')) {
          return new Response(JSON.stringify({ data: { project } }), { status: 200 });
        }
        if (method === 'PATCH') {
          return new Response(
            JSON.stringify({
              data: { project: { ...project, title: 'Updated Owner Project', version: 3 } },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ data: { project } }), { status: 200 });
      }),
    );
  });

  it('loads owner controls, candidate context, and sends an optimistic version on edit', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { name: /Shape the invitation/i }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Student Candidate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start delivery/i })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Project title' }), {
      target: { value: 'Updated Owner Project' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save project/i }));

    await waitFor(() => {
      const fetchMock = vi.mocked(fetch);
      const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
        title: 'Updated Owner Project',
        version: 2,
      });
    });
  });
});
