import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Clock3, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Button, ErrorState, LoadingState, StatusPill, TextAreaField } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useSession } from '../lib/session';
import type { Application, Project } from '../lib/types';

export const ProjectDetailPage = () => {
  const { slug = '' } = useParams();
  const { session } = useSession();
  const [coverLetter, setCoverLetter] = useState('');
  const projectQuery = useQuery({
    queryKey: ['project', slug],
    queryFn: () => api.get<{ project: Project }>(`/projects/${slug}`),
  });
  const application = useMutation({
    mutationFn: (projectId: string) =>
      api.post<{ application: Application }>(`/projects/${projectId}/applications`, {
        coverLetter,
      }),
  });

  if (projectQuery.isPending)
    return (
      <div className="page-frame">
        <LoadingState label="Loading project brief" />
      </div>
    );
  if (projectQuery.isError || !projectQuery.data)
    return (
      <div className="page-frame">
        <ErrorState
          message="This project could not be loaded."
          retry={() => void projectQuery.refetch()}
        />
      </div>
    );
  const project = projectQuery.data.project;
  const isOwner = session?.user.id === project.ownerId;
  const spotsLeft = Math.max(project.capacity - project.memberCount, 0);

  return (
    <section className="project-detail page-frame">
      <Link className="back-link" to="/">
        <ArrowLeft size={16} />
        Back to project board
      </Link>
      <header className="project-detail__header">
        <div>
          <div className="project-detail__status">
            <StatusPill tone="good">{project.status}</StatusPill>
            <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
          </div>
          <h1>{project.title}</h1>
        </div>
        <div className="project-detail__capacity">
          <strong>{spotsLeft}</strong>
          <span>
            open
            <br />
            positions
          </span>
        </div>
      </header>

      <div className="project-detail__grid">
        <article className="project-brief">
          <p className="eyebrow">The brief</p>
          <p className="project-brief__description">{project.description}</p>
          <div className="brief-facts">
            <div>
              <UsersRound size={18} />
              <span>Team</span>
              <strong>
                {project.memberCount} / {project.capacity}
              </strong>
            </div>
            <div>
              <Clock3 size={18} />
              <span>State</span>
              <strong>{project.status.toLowerCase()}</strong>
            </div>
            <div>
              <CheckCircle2 size={18} />
              <span>Lead</span>
              <strong>{project.ownerDisplayName}</strong>
            </div>
          </div>
          <div className="skill-spec">
            <p className="eyebrow">People we need</p>
            {project.requiredSkills.length ? (
              <ul>
                {project.requiredSkills.map((skill) => (
                  <li key={skill.skillId}>
                    <span>{skill.name}</span>
                    <b>Level {skill.desiredLevel}+</b>
                    <em>
                      {skill.positions} {skill.positions === 1 ? 'seat' : 'seats'}
                    </em>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-copy">The owner is open to multidisciplinary contributors.</p>
            )}
          </div>
        </article>

        <aside className="application-panel">
          {isOwner ? (
            <>
              <span className="eyebrow">Owner controls</span>
              <h2>Your team is waiting.</h2>
              <p>
                Edit the brief, review applications, manage lifecycle, or move work across the
                board.
              </p>
              <div className="owner-links">
                <Link className="button button--primary" to={`/projects/manage/${project.id}`}>
                  <span>Manage project</span>
                </Link>
                <Link to={`/workspace/${project.id}`}>Open workspace</Link>
              </div>
            </>
          ) : application.isSuccess ? (
            <div className="application-success">
              <CheckCircle2 size={32} />
              <span className="eyebrow">Application sent</span>
              <h2>The owner has your signal.</h2>
              <p>You can track or withdraw this application from your application desk.</p>
              <Link to="/applications">View applications</Link>
            </div>
          ) : session ? (
            <>
              <span className="eyebrow">Apply to collaborate</span>
              <h2>What will you own?</h2>
              <p>Write to the work. Explain where you can contribute and what you want to learn.</p>
              <TextAreaField
                label="Cover letter"
                maxLength={5000}
                minLength={20}
                onChange={(event) => setCoverLetter(event.target.value)}
                placeholder="I can take responsibility for…"
                rows={8}
                value={coverLetter}
              />
              {application.isError ? (
                <p className="form-error" role="alert">
                  {application.error instanceof ApiError
                    ? application.error.message
                    : 'Application failed.'}
                </p>
              ) : null}
              <Button
                disabled={coverLetter.trim().length < 20 || application.isPending}
                onClick={() => application.mutate(project.id)}
              >
                {application.isPending ? 'Sending…' : 'Send application'}
              </Button>
            </>
          ) : (
            <>
              <span className="eyebrow">Apply to collaborate</span>
              <h2>Bring a useful point of view.</h2>
              <p>Sign in to explain the work you can own and track the decision.</p>
              <Link
                className="button button--primary"
                state={{ from: `/projects/${slug}` }}
                to="/login"
              >
                <span>Log in to apply</span>
              </Link>
            </>
          )}
        </aside>
      </div>
    </section>
  );
};
