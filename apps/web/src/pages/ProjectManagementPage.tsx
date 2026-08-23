import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Check, CircleX, Play, Save, UserRoundCheck, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';

import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  StatusPill,
  TextAreaField,
} from '../components/ui';
import { api, ApiError } from '../lib/api';
import type { Application, Project } from '../lib/types';

interface ProjectValues {
  capacity: number;
  description: string;
  title: string;
}

type LifecycleAction = 'PUBLISH' | 'START' | 'COMPLETE' | 'CANCEL' | 'ARCHIVE';

const lifecycleActions: Partial<
  Record<
    Project['status'],
    Array<{
      action: LifecycleAction;
      icon: typeof Play;
      label: string;
      variant: 'primary' | 'secondary' | 'quiet';
    }>
  >
> = {
  ACTIVE: [
    { action: 'COMPLETE', icon: Check, label: 'Complete project', variant: 'primary' },
    { action: 'CANCEL', icon: CircleX, label: 'Cancel project', variant: 'quiet' },
  ],
  CANCELLED: [{ action: 'ARCHIVE', icon: Archive, label: 'Archive project', variant: 'secondary' }],
  COMPLETED: [{ action: 'ARCHIVE', icon: Archive, label: 'Archive project', variant: 'secondary' }],
  DRAFT: [{ action: 'PUBLISH', icon: Play, label: 'Publish for recruitment', variant: 'primary' }],
  RECRUITING: [
    { action: 'START', icon: Play, label: 'Start delivery', variant: 'primary' },
    { action: 'CANCEL', icon: CircleX, label: 'Cancel project', variant: 'quiet' },
  ],
};

const applicationTone = (status: Application['status']) =>
  status === 'ACCEPTED' ? 'good' : status === 'PENDING' ? 'warn' : 'neutral';

export const ProjectManagementPage = () => {
  const { projectId = '' } = useParams();
  const query = useQuery({
    queryFn: () => api.get<{ project: Project }>(`/projects/${projectId}/manage`),
    queryKey: ['project', 'manage', projectId],
  });

  if (query.isPending)
    return (
      <div className="page-frame">
        <LoadingState label="Opening project control room" />
      </div>
    );
  if (query.isError)
    return (
      <div className="page-frame">
        <ErrorState
          message="This project is unavailable or belongs to another owner."
          retry={() => void query.refetch()}
        />
      </div>
    );

  return <ProjectManagementWorkspace initialProject={query.data.project} />;
};

const ProjectManagementWorkspace = ({ initialProject }: { initialProject: Project }) => {
  const queryClient = useQueryClient();
  const projectId = initialProject.id;
  const managedProject =
    queryClient.getQueryData<{ project: Project }>(['project', 'manage', projectId])?.project ??
    initialProject;
  const form = useForm<ProjectValues>({
    defaultValues: {
      capacity: initialProject.capacity,
      description: initialProject.description,
      title: initialProject.title,
    },
  });
  const applications = useQuery({
    queryFn: () => api.get<{ applications: Application[] }>(`/projects/${projectId}/applications`),
    queryKey: ['applications', 'project', projectId],
  });
  const updateProject = useMutation({
    mutationFn: (values: ProjectValues) =>
      api.patch<{ project: Project }>(`/projects/${projectId}`, {
        capacity: Number(values.capacity),
        description: values.description,
        title: values.title,
        version: managedProject.version,
      }),
    onSuccess: (data) => queryClient.setQueryData(['project', 'manage', projectId], data),
  });
  const transition = useMutation({
    mutationFn: (action: LifecycleAction) =>
      api.post<{ project: Project }>(`/projects/${projectId}/transitions`, {
        action,
        version: managedProject.version,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['project', 'manage', projectId], data);
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
  const decision = useMutation({
    mutationFn: ({
      applicationId,
      value,
    }: {
      applicationId: string;
      value: 'ACCEPTED' | 'REJECTED';
    }) =>
      api.post<{ application: Application }>(`/applications/${applicationId}/decision`, {
        decision: value,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['applications', 'project', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['project', 'manage', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['members', projectId] });
    },
  });
  const actions = lifecycleActions[managedProject.status] ?? [];
  const mutationError = updateProject.error ?? transition.error ?? decision.error;

  return (
    <section className="manager-layout page-frame">
      <header className="manager-heading">
        <div>
          <span className="eyebrow">Owner control room</span>
          <h1>
            Shape the invitation.
            <br />
            Protect the delivery.
          </h1>
        </div>
        <div>
          <StatusPill tone={managedProject.status === 'CANCELLED' ? 'warn' : 'good'}>
            {managedProject.status}
          </StatusPill>
          <p>
            Version {managedProject.version} · {managedProject.memberCount}/
            {managedProject.capacity} seats filled
          </p>
          <Link to={`/workspace/${projectId}`}>Open delivery board</Link>
        </div>
      </header>

      {mutationError ? (
        <ErrorState
          message={
            mutationError instanceof ApiError ? mutationError.message : 'The project action failed.'
          }
        />
      ) : null}

      <div className="manager-grid">
        <form
          className="manager-panel"
          onSubmit={(event) =>
            void form.handleSubmit((values) => updateProject.mutate(values))(event)
          }
        >
          <div className="panel-heading">
            <span>PROJECT BRIEF</span>
            <Save size={17} />
          </div>
          <Field
            error={form.formState.errors.title?.message}
            label="Project title"
            {...form.register('title', {
              minLength: { message: 'Use at least three characters.', value: 3 },
              required: 'Title is required.',
            })}
          />
          <TextAreaField
            error={form.formState.errors.description?.message}
            label="Description"
            rows={8}
            {...form.register('description', {
              minLength: { message: 'Write at least 20 characters.', value: 20 },
              required: 'Description is required.',
            })}
          />
          <Field
            error={form.formState.errors.capacity?.message}
            label="Team capacity"
            max={100}
            min={managedProject.memberCount}
            type="number"
            {...form.register('capacity', {
              min: {
                message: 'Capacity cannot be below the current team size.',
                value: managedProject.memberCount,
              },
              valueAsNumber: true,
            })}
          />
          <Button disabled={updateProject.isPending} type="submit">
            {updateProject.isPending ? 'Saving…' : 'Save project'}
          </Button>
        </form>

        <div className="manager-panel lifecycle-panel">
          <div className="panel-heading">
            <span>LIFECYCLE</span>
            <Play size={17} />
          </div>
          <h2>{managedProject.status.toLowerCase().replace('_', ' ')}</h2>
          <p>
            Lifecycle changes are validated by the API with the current version, so stale owner tabs
            cannot overwrite newer decisions.
          </p>
          <div className="lifecycle-actions">
            {actions.map(({ action, icon: Icon, label, variant }) => (
              <Button
                disabled={transition.isPending}
                key={action}
                onClick={() => transition.mutate(action)}
                variant={variant}
              >
                <Icon size={16} />
                {label}
              </Button>
            ))}
          </div>
          {actions.length === 0 ? (
            <p className="terminal-state">
              This project is archived. Its delivery evidence remains read-only.
            </p>
          ) : null}
        </div>
      </div>

      <section className="candidate-desk">
        <header>
          <div>
            <span className="eyebrow">Candidate desk</span>
            <h2>Decide with context.</h2>
          </div>
          <p>
            Accepting a candidate creates membership atomically and re-checks project capacity
            inside PostgreSQL.
          </p>
        </header>
        {applications.isPending ? <LoadingState label="Loading project applications" /> : null}
        {applications.isError ? (
          <ErrorState
            message="Applications could not be loaded for this project."
            retry={() => void applications.refetch()}
          />
        ) : null}
        {applications.data?.applications.length === 0 ? (
          <EmptyState title="No candidate signals yet">
            <p>Keep the brief specific and share the public project link.</p>
          </EmptyState>
        ) : null}
        {applications.data?.applications.length ? (
          <div className="candidate-list">
            {applications.data.applications.map((application, index) => (
              <article key={application.id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <StatusPill tone={applicationTone(application.status)}>
                    {application.status}
                  </StatusPill>
                  <h3>{application.applicantDisplayName ?? 'Student candidate'}</h3>
                  {application.email ? (
                    <a href={`mailto:${application.email}`}>{application.email}</a>
                  ) : null}
                  <p>{application.coverLetter}</p>
                </div>
                <div>
                  {application.status === 'PENDING' ? (
                    <>
                      <Button
                        disabled={decision.isPending}
                        onClick={() =>
                          decision.mutate({ applicationId: application.id, value: 'ACCEPTED' })
                        }
                      >
                        <UserRoundCheck size={16} />
                        Accept
                      </Button>
                      <Button
                        disabled={decision.isPending}
                        onClick={() =>
                          decision.mutate({ applicationId: application.id, value: 'REJECTED' })
                        }
                        variant="quiet"
                      >
                        <X size={16} />
                        Reject
                      </Button>
                    </>
                  ) : (
                    <span className="decision-note">Decision recorded</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </section>
  );
};
