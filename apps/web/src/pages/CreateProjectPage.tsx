import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import { Button, Field, TextAreaField } from '../components/ui';
import { api, ApiError } from '../lib/api';
import type { Project, Skill } from '../lib/types';

interface ProjectForm {
  capacity: number;
  description: string;
  publish: boolean;
  skillId: string;
  slug: string;
  title: string;
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');

export const CreateProjectPage = () => {
  const navigate = useNavigate();
  const skills = useQuery({
    queryKey: ['skills'],
    queryFn: () => api.get<{ skills: Skill[] }>('/skills'),
  });
  const form = useForm<ProjectForm>({
    defaultValues: {
      capacity: 5,
      description: '',
      publish: true,
      skillId: '',
      slug: '',
      title: '',
    },
  });
  const creation = useMutation({
    mutationFn: async (values: ProjectForm) => {
      const created = await api.post<{ project: Project }>('/projects', {
        capacity: Number(values.capacity),
        description: values.description,
        requiredSkills: values.skillId
          ? [{ desiredLevel: 3, positions: 1, skillId: values.skillId }]
          : [],
        slug: values.slug,
        title: values.title,
      });
      if (!values.publish) return created.project;
      const published = await api.post<{ project: Project }>(
        `/projects/${created.project.id}/transitions`,
        { action: 'PUBLISH', version: created.project.version },
      );
      return published.project;
    },
    onSuccess: (project) =>
      navigate(
        project.status === 'RECRUITING'
          ? `/projects/${project.slug}`
          : `/projects/manage/${project.id}`,
      ),
  });
  const submit = form.handleSubmit((values) => creation.mutate(values));

  return (
    <section className="editor-layout page-frame">
      <header className="editor-intro">
        <span className="eyebrow">Project canvas / 01</span>
        <h1>
          Turn an idea into
          <br />a clear invitation.
        </h1>
        <p>Strong teams begin with a bounded problem, honest capacity, and useful expectations.</p>
      </header>
      <form className="editor-form" onSubmit={(event) => void submit(event)}>
        <div className="form-section">
          <span>01</span>
          <div>
            <h2>Name the work</h2>
            <p>Use a title someone can understand without knowing your club or course.</p>
          </div>
        </div>
        <Field
          error={form.formState.errors.title?.message}
          label="Project title"
          {...form.register('title', {
            onChange: (event) => {
              if (!form.formState.dirtyFields.slug)
                form.setValue('slug', slugify(String(event.target.value)), {
                  shouldValidate: true,
                });
            },
            required: 'Give the project a title.',
          })}
        />
        <Field
          error={form.formState.errors.slug?.message}
          hint="Lowercase letters, numbers, and hyphens"
          label="Public slug"
          {...form.register('slug', {
            pattern: {
              message: 'Use lowercase words separated by hyphens.',
              value: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
            },
            required: 'Choose a public slug.',
          })}
        />
        <TextAreaField
          error={form.formState.errors.description?.message}
          label="Project brief"
          placeholder="What problem are you solving, for whom, and what will the first release prove?"
          rows={8}
          {...form.register('description', {
            maxLength: 10000,
            minLength: { message: 'Write at least 20 characters.', value: 20 },
            required: 'Describe the project.',
          })}
        />

        <div className="form-section">
          <span>02</span>
          <div>
            <h2>Shape the team</h2>
            <p>Capacity includes you. Start smaller than your ambition and grow deliberately.</p>
          </div>
        </div>
        <Field
          error={form.formState.errors.capacity?.message}
          label="Team capacity"
          max={100}
          min={1}
          type="number"
          {...form.register('capacity', { max: 100, min: 1, valueAsNumber: true })}
        />
        <label className="field">
          <span className="field__label">Primary skill signal</span>
          <select className="field__control" {...form.register('skillId')}>
            <option value="">Open to all disciplines</option>
            {skills.data?.skills.map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check-field">
          <input type="checkbox" {...form.register('publish')} />
          <span>
            <strong>Publish immediately</strong>
            <small>Move from draft to recruiting after creation.</small>
          </span>
        </label>
        {creation.isError ? (
          <p className="form-error" role="alert">
            {creation.error instanceof ApiError
              ? creation.error.message
              : 'The project could not be created.'}
          </p>
        ) : null}
        <Button disabled={creation.isPending} type="submit">
          {creation.isPending ? 'Creating…' : 'Create project'}
        </Button>
      </form>
    </section>
  );
};
