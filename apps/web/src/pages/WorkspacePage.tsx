import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarRange, MessageCircle, Plus, Send, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { Button, EmptyState, ErrorState, LoadingState, StatusPill } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useSession } from '../lib/session';
import type { Member, ProjectTask, Sprint } from '../lib/types';
import { useProjectRealtime } from '../lib/useProjectRealtime';

const columns: Array<{ id: ProjectTask['status']; label: string }> = [
  { id: 'TODO', label: 'To do' },
  { id: 'IN_PROGRESS', label: 'In progress' },
  { id: 'REVIEW', label: 'Review' },
  { id: 'DONE', label: 'Done' },
];
const nextStatus: Partial<Record<ProjectTask['status'], ProjectTask['status']>> = {
  TODO: 'IN_PROGRESS',
  IN_PROGRESS: 'REVIEW',
  REVIEW: 'DONE',
};

export const WorkspacePage = () => {
  const { projectId = '' } = useParams();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [composerOpen, setComposerOpen] = useState(false);
  const [messageBody, setMessageBody] = useState('');
  const [messageError, setMessageError] = useState('');
  const [messagePending, setMessagePending] = useState(false);
  const [title, setTitle] = useState('');
  const realtime = useProjectRealtime(projectId);
  const tasks = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => api.get<{ tasks: ProjectTask[] }>(`/projects/${projectId}/tasks`),
  });
  const members = useQuery({
    queryKey: ['members', projectId],
    queryFn: () => api.get<{ members: Member[] }>(`/projects/${projectId}/members`),
  });
  const sprints = useQuery({
    queryKey: ['sprints', projectId],
    queryFn: () => api.get<{ sprints: Sprint[] }>(`/projects/${projectId}/sprints`),
  });
  const activeSprint =
    sprints.data?.sprints.find((sprint) => sprint.status === 'ACTIVE') ?? sprints.data?.sprints[0];

  const updateTask = useMutation({
    mutationFn: ({ status, task }: { status: ProjectTask['status']; task: ProjectTask }) =>
      api.patch<{ task: ProjectTask }>(`/tasks/${task.id}`, { status, version: task.version }),
    onMutate: async ({ status, task }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', projectId] });
      const previous = queryClient.getQueryData<{ tasks: ProjectTask[] }>(['tasks', projectId]);
      queryClient.setQueryData<{ tasks: ProjectTask[] }>(['tasks', projectId], (current) => ({
        tasks:
          current?.tasks.map((item) =>
            item.id === task.id ? { ...item, status, version: item.version + 1 } : item,
          ) ?? [],
      }));
      return { previous };
    },
    onError: (_error, _variables, context) =>
      queryClient.setQueryData(['tasks', projectId], context?.previous),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });
  const createTask = useMutation({
    mutationFn: () =>
      api.post<{ task: ProjectTask }>(`/projects/${projectId}/tasks`, {
        assigneeIds: [],
        priority: 'MEDIUM',
        ...(activeSprint ? { sprintId: activeSprint.id } : {}),
        title,
      }),
    onSuccess: () => {
      setTitle('');
      setComposerOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    },
  });

  if (tasks.isPending || members.isPending || sprints.isPending)
    return (
      <div className="page-frame">
        <LoadingState label="Opening team workspace" />
      </div>
    );
  if (tasks.isError || members.isError || sprints.isError)
    return (
      <div className="page-frame">
        <ErrorState
          message="You may not have access to this project workspace."
          retry={() => {
            void tasks.refetch();
            void members.refetch();
            void sprints.refetch();
          }}
        />
      </div>
    );

  return (
    <section className="workspace page-frame">
      <header className="workspace-header">
        <div>
          <span className="eyebrow">Team workspace</span>
          <h1>Delivery board</h1>
        </div>
        <div className="workspace-stats">
          <span>
            <CalendarRange size={16} />
            {activeSprint?.name ?? 'Backlog'}
          </span>
          <span>
            <UsersRound size={16} />
            {members.data?.members.length ?? 0} members
          </span>
        </div>
        <Button onClick={() => setComposerOpen((value) => !value)}>
          <Plus size={16} />
          New task
        </Button>
      </header>
      {composerOpen ? (
        <form
          className="task-composer"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim().length >= 2) createTask.mutate();
          }}
        >
          <label>
            <span>Task title</span>
            <input
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Define a small, visible outcome"
              value={title}
            />
          </label>
          <Button disabled={title.trim().length < 2 || createTask.isPending} type="submit">
            Add to board
          </Button>
          {createTask.isError ? (
            <p className="form-error">
              {createTask.error instanceof ApiError
                ? createTask.error.message
                : 'Task creation failed.'}
            </p>
          ) : null}
        </form>
      ) : null}
      <div className="workspace-live-grid">
        <div className="board" aria-label="Task board">
          {columns.map((column) => {
            const items = tasks.data?.tasks.filter((task) => task.status === column.id) ?? [];
            return (
              <section className="board-column" key={column.id}>
                <header>
                  <span>{column.label}</span>
                  <b>{items.length}</b>
                </header>
                <div className="board-column__tasks">
                  {items.map((task) => (
                    <article className="task-card" key={task.id}>
                      <div>
                        <StatusPill
                          tone={
                            task.priority === 'URGENT' || task.priority === 'HIGH'
                              ? 'warn'
                              : 'neutral'
                          }
                        >
                          {task.priority}
                        </StatusPill>
                        <span>v{task.version}</span>
                      </div>
                      <h2>{task.title}</h2>
                      {task.description ? <p>{task.description}</p> : null}
                      <footer>
                        <div className="avatar-stack">
                          {task.assignees.length ? (
                            task.assignees.map((assignee) => (
                              <span key={assignee.userId} title={assignee.displayName}>
                                {assignee.displayName.slice(0, 2).toUpperCase()}
                              </span>
                            ))
                          ) : (
                            <em>Unassigned</em>
                          )}
                        </div>
                        {nextStatus[task.status] ? (
                          <button
                            aria-label={`Move ${task.title} to ${nextStatus[task.status]}`}
                            disabled={updateTask.isPending}
                            onClick={() =>
                              updateTask.mutate({ status: nextStatus[task.status]!, task })
                            }
                            type="button"
                          >
                            <ArrowRight size={16} />
                          </button>
                        ) : null}
                      </footer>
                    </article>
                  ))}
                  {items.length === 0 ? <div className="board-empty">No work here</div> : null}
                </div>
              </section>
            );
          })}
        </div>
        <aside className="team-chat" aria-label="Team chat">
          <header>
            <div>
              <MessageCircle size={18} />
              <div>
                <b>Team signal</b>
                <span>{realtime.onlineUserIds.length} online</span>
              </div>
            </div>
            <StatusPill tone={realtime.connection === 'live' ? 'good' : 'neutral'}>
              {realtime.connection}
            </StatusPill>
          </header>
          <div className="team-chat__messages" aria-live="polite">
            {realtime.messages.map((message) => (
              <article
                className={message.sender.userId === session?.user.id ? 'is-mine' : ''}
                key={message.id}
              >
                <div>
                  <b>{message.sender.displayName}</b>
                  <time dateTime={message.createdAt}>
                    {new Date(message.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
                <p>{message.body}</p>
              </article>
            ))}
            {realtime.messages.length === 0 ? (
              <p className="team-chat__empty">Start with the decision the team needs next.</p>
            ) : null}
          </div>
          <div className="team-chat__typing">
            {realtime.typingUserIds.length
              ? `${realtime.typingUserIds
                  .map(
                    (userId) =>
                      members.data?.members.find((member) => member.userId === userId)
                        ?.displayName ?? 'A teammate',
                  )
                  .join(', ')} typing…`
              : '\u00a0'}
          </div>
          <form
            className="team-chat__composer"
            onSubmit={async (event) => {
              event.preventDefault();
              const body = messageBody.trim();
              if (!body || messagePending) return;
              setMessagePending(true);
              setMessageError('');
              try {
                await realtime.sendMessage(body);
                setMessageBody('');
                realtime.setTyping(false);
              } catch (error) {
                setMessageError(error instanceof Error ? error.message : 'Message failed.');
              } finally {
                setMessagePending(false);
              }
            }}
          >
            <label>
              <span className="sr-only">Team message</span>
              <textarea
                maxLength={2000}
                onBlur={() => realtime.setTyping(false)}
                onChange={(event) => {
                  setMessageBody(event.target.value);
                  realtime.setTyping(Boolean(event.target.value.trim()));
                }}
                placeholder="Share a blocker or decision…"
                rows={2}
                value={messageBody}
              />
            </label>
            <button
              aria-label="Send team message"
              disabled={!messageBody.trim() || messagePending || realtime.connection !== 'live'}
              type="submit"
            >
              <Send size={17} />
            </button>
          </form>
          {messageError ? <p className="form-error">{messageError}</p> : null}
        </aside>
      </div>
      {tasks.data?.tasks.length === 0 ? (
        <EmptyState title="This board is ready for its first task" />
      ) : null}
    </section>
  );
};
