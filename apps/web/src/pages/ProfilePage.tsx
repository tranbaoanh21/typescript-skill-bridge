import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button, ErrorState, Field, LoadingState, TextAreaField } from '../components/ui';
import { api, ApiError } from '../lib/api';
import type { Profile, Skill } from '../lib/types';

interface ProfileValues {
  bio: string;
  displayName: string;
  graduationYear: number | '';
  major: string;
  university: string;
}

export const ProfilePage = () => {
  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<{ profile: Profile }>('/profile'),
  });
  const skills = useQuery({
    queryKey: ['skills'],
    queryFn: () => api.get<{ skills: Skill[] }>('/skills'),
  });

  if (profile.isPending)
    return (
      <div className="page-frame">
        <LoadingState label="Loading your profile" />
      </div>
    );
  if (profile.isError)
    return (
      <div className="page-frame">
        <ErrorState
          message="Your profile could not be loaded."
          retry={() => void profile.refetch()}
        />
      </div>
    );

  return (
    <ProfileEditor
      availableSkills={skills.data?.skills ?? []}
      initialProfile={profile.data.profile}
    />
  );
};

const ProfileEditor = ({
  availableSkills,
  initialProfile,
}: {
  availableSkills: Skill[];
  initialProfile: Profile;
}) => {
  const queryClient = useQueryClient();
  const [levels, setLevels] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialProfile.skills.map((skill) => [skill.skillId, skill.level])),
  );
  const form = useForm<ProfileValues>({
    defaultValues: {
      bio: initialProfile.bio ?? '',
      displayName: initialProfile.displayName,
      graduationYear: initialProfile.graduationYear ?? '',
      major: initialProfile.major ?? '',
      university: initialProfile.university,
    },
  });
  const profileMutation = useMutation({
    mutationFn: (values: ProfileValues) =>
      api.put<{ profile: Profile }>('/profile', {
        ...values,
        bio: values.bio || null,
        graduationYear: values.graduationYear === '' ? null : Number(values.graduationYear),
        major: values.major || null,
      }),
    onSuccess: (data) => queryClient.setQueryData(['profile'], data),
  });
  const skillMutation = useMutation({
    mutationFn: () =>
      api.put<{ profile: Profile }>('/profile/skills', {
        skills: Object.entries(levels).map(([skillId, level]) => ({ level, skillId })),
      }),
    onSuccess: (data) => queryClient.setQueryData(['profile'], data),
  });

  return (
    <section className="profile-layout page-frame">
      <header className="profile-heading">
        <div>
          <span className="eyebrow">Your public signal</span>
          <h1>
            Make your
            <br />
            work legible.
          </h1>
        </div>
        <p>
          A useful profile is not a biography. It tells a future teammate what you can own now and
          what you are actively learning.
        </p>
      </header>
      <div className="profile-grid">
        <form
          className="profile-card"
          onSubmit={(event) =>
            void form.handleSubmit((values) => profileMutation.mutate(values))(event)
          }
        >
          <div className="panel-heading">
            <span>IDENTITY</span>
            <Save size={17} />
          </div>
          <Field label="Display name" {...form.register('displayName', { required: true })} />
          <Field label="University" {...form.register('university', { required: true })} />
          <div className="field-row">
            <Field label="Major" {...form.register('major')} />
            <Field
              label="Graduation year"
              min={2000}
              max={2200}
              type="number"
              {...form.register('graduationYear')}
            />
          </div>
          <TextAreaField label="Working bio" rows={5} {...form.register('bio')} />
          {profileMutation.isError ? (
            <p className="form-error">
              {profileMutation.error instanceof ApiError
                ? profileMutation.error.message
                : 'Could not save profile.'}
            </p>
          ) : null}
          <Button disabled={profileMutation.isPending} type="submit">
            Save profile
          </Button>
        </form>

        <div className="profile-card skill-editor">
          <div className="panel-heading">
            <span>SKILL MAP</span>
            <Sparkles size={17} />
          </div>
          <p>
            Select only skills you are willing to discuss and use. Levels describe current
            confidence, not identity.
          </p>
          <div className="skill-list">
            {availableSkills.map((skill) => {
              const selected = levels[skill.id] !== undefined;
              return (
                <div className={selected ? 'skill-row is-selected' : 'skill-row'} key={skill.id}>
                  <label>
                    <input
                      checked={selected}
                      onChange={(event) =>
                        setLevels((current) => {
                          const next = { ...current };
                          if (event.target.checked) next[skill.id] = 3;
                          else delete next[skill.id];
                          return next;
                        })
                      }
                      type="checkbox"
                    />
                    <span>{skill.name}</span>
                  </label>
                  {selected ? (
                    <select
                      aria-label={`${skill.name} level`}
                      onChange={(event) =>
                        setLevels((current) => ({
                          ...current,
                          [skill.id]: Number(event.target.value),
                        }))
                      }
                      value={levels[skill.id]}
                    >
                      {[1, 2, 3, 4, 5].map((level) => (
                        <option key={level} value={level}>
                          L{level}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              );
            })}
          </div>
          {skillMutation.isError ? (
            <p className="form-error">
              {skillMutation.error instanceof ApiError
                ? skillMutation.error.message
                : 'Could not save skills.'}
            </p>
          ) : null}
          <Button
            disabled={skillMutation.isPending}
            onClick={() => skillMutation.mutate()}
            variant="secondary"
          >
            Save skill map
          </Button>
        </div>
      </div>
    </section>
  );
};
