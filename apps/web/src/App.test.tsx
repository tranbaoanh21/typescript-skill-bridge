import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

describe('App', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        const data = url.includes('/skills')
          ? { skills: [{ id: 'skill-react', name: 'React', slug: 'react' }] }
          : {
              items: [
                {
                  capacity: 5,
                  createdAt: '2026-08-20T00:00:00.000Z',
                  description: 'Help students find quieter study spaces across campus.',
                  id: 'project-1',
                  memberCount: 2,
                  ownerDisplayName: 'Bao Anh',
                  ownerId: 'owner-1',
                  requiredSkills: [
                    {
                      desiredLevel: 2,
                      id: 'skill-react',
                      name: 'React',
                      positions: 1,
                      skillId: 'skill-react',
                      slug: 'react',
                    },
                  ],
                  slug: 'campus-study-map',
                  status: 'RECRUITING',
                  title: 'Campus Study Map',
                  updatedAt: '2026-08-20T00:00:00.000Z',
                  version: 1,
                },
              ],
              page: 1,
              pageSize: 12,
              total: 1,
            };
        return new Response(JSON.stringify({ data }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        });
      }),
    );
  });

  it('communicates the product value proposition and renders API projects', async () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: /Don’t wait for.*experience.*Build it/i }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Campus Study Map' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Join the bridge/i })).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('protects student workspace routes for guests', () => {
    window.history.replaceState({}, '', '/profile');
    render(<App />);

    expect(
      screen.getByRole('heading', { name: /Cross the bridge.*to continue/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Log in' })).toHaveLength(2);
  });
});
