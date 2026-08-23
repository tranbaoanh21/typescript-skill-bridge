import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Undo2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, EmptyState, ErrorState, LoadingState, StatusPill } from '../components/ui';
import { api } from '../lib/api';
import type { Application } from '../lib/types';

const tone = (status: Application['status']) =>
  status === 'ACCEPTED' ? 'good' : status === 'PENDING' ? 'warn' : 'neutral';

export const ApplicationsPage = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['applications', 'me'],
    queryFn: () => api.get<{ applications: Application[] }>('/applications/me'),
  });
  const withdrawal = useMutation({
    mutationFn: (id: string) =>
      api.post<{ application: Application }>(`/applications/${id}/withdraw`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['applications', 'me'] });
      const previous = queryClient.getQueryData<{ applications: Application[] }>([
        'applications',
        'me',
      ]);
      queryClient.setQueryData<{ applications: Application[] }>(
        ['applications', 'me'],
        (current) => ({
          applications:
            current?.applications.map((item) =>
              item.id === id ? { ...item, status: 'WITHDRAWN' } : item,
            ) ?? [],
        }),
      );
      return { previous };
    },
    onError: (_error, _id, context) =>
      queryClient.setQueryData(['applications', 'me'], context?.previous),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['applications', 'me'] }),
  });

  return (
    <section className="desk-layout page-frame">
      <header className="desk-heading">
        <span className="eyebrow">Application desk</span>
        <h1>
          Track every
          <br />
          open door.
        </h1>
        <p>Pending signals, decisions, and the projects you have joined live here.</p>
      </header>
      {query.isPending ? <LoadingState label="Loading your applications" /> : null}
      {query.isError ? (
        <ErrorState
          message="Applications could not be loaded."
          retry={() => void query.refetch()}
        />
      ) : null}
      {query.data?.applications.length === 0 ? (
        <EmptyState title="No applications yet">
          <p>Find a project where your current skills can become useful work.</p>
          <Link to="/">Browse projects</Link>
        </EmptyState>
      ) : null}
      {query.data?.applications.length ? (
        <div className="application-list">
          {query.data.applications.map((application, index) => (
            <article key={application.id}>
              <span className="application-list__index">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <StatusPill tone={tone(application.status)}>{application.status}</StatusPill>
                <h2>{application.projectTitle ?? 'Project application'}</h2>
                <p>{application.coverLetter}</p>
                <time>{new Date(application.createdAt).toLocaleDateString()}</time>
              </div>
              <div className="application-list__actions">
                {application.status === 'PENDING' ? (
                  <Button
                    disabled={withdrawal.isPending}
                    onClick={() => withdrawal.mutate(application.id)}
                    variant="quiet"
                  >
                    <Undo2 size={15} />
                    Withdraw
                  </Button>
                ) : null}
                {application.status === 'ACCEPTED' ? (
                  <Link to={`/workspace/${application.projectId}`}>
                    Open workspace <ArrowUpRight size={16} />
                  </Link>
                ) : application.projectSlug ? (
                  <Link to={`/projects/${application.projectSlug}`}>
                    View project <ArrowUpRight size={16} />
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
};
