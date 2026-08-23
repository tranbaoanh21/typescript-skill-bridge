import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ProjectCard } from '../components/ProjectCard';
import { EmptyState, ErrorState, LoadingState } from '../components/ui';
import { api } from '../lib/api';
import type { Project, Skill } from '../lib/types';

interface ProjectPage {
  items: Project[];
  page: number;
  pageSize: number;
  total: number;
}

export const DiscoveryPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const skill = searchParams.get('skill') ?? '';
  const projectQuery = useQuery({
    queryKey: ['projects', searchParams.toString()],
    queryFn: () => api.get<ProjectPage>(`/projects?${searchParams.toString()}`),
  });
  const skillsQuery = useQuery({
    queryKey: ['skills'],
    queryFn: () => api.get<{ skills: Skill[] }>('/skills'),
  });

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (search.trim()) next.set('search', search.trim());
    else next.delete('search');
    setSearchParams(next);
  };

  return (
    <>
      <section className="hero page-frame">
        <div className="hero__marker" aria-hidden="true">
          01 / DISCOVER
        </div>
        <div className="hero__copy">
          <p className="eyebrow">A project network for HCMUT students</p>
          <h1>
            Don’t wait for
            <br />
            <em>experience.</em>
            <br />
            Build it.
          </h1>
        </div>
        <div className="hero__aside">
          <p>
            Find serious student teams, contribute what you know, and leave with work you can
            explain in an interview.
          </p>
          <div>
            <strong>{projectQuery.data?.total ?? '—'}</strong>
            <span>open projects</span>
          </div>
        </div>
      </section>

      <section className="discovery page-frame" id="projects">
        <div className="section-heading">
          <div>
            <span>ACTIVE BOARD</span>
            <h2>
              Projects looking
              <br />
              for collaborators
            </h2>
          </div>
          <p>
            Filter by what you want to practise. Apply with context, not a one-click résumé dump.
          </p>
        </div>

        <form className="filter-bar" onSubmit={submitSearch}>
          <label>
            <Search aria-hidden="true" size={18} />
            <span className="sr-only">Search projects</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by problem or title"
              value={search}
            />
          </label>
          <label>
            <SlidersHorizontal aria-hidden="true" size={17} />
            <span className="sr-only">Filter by skill</span>
            <select
              onChange={(event) => {
                const next = new URLSearchParams(searchParams);
                if (event.target.value) next.set('skill', event.target.value);
                else next.delete('skill');
                setSearchParams(next);
              }}
              value={skill}
            >
              <option value="">All disciplines</option>
              {skillsQuery.data?.skills.map((item) => (
                <option key={item.id} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Search board</button>
        </form>

        {projectQuery.isPending ? <LoadingState label="Loading the project board" /> : null}
        {projectQuery.isError ? (
          <ErrorState
            message="The project board could not be reached."
            retry={() => void projectQuery.refetch()}
          />
        ) : null}
        {projectQuery.data?.items.length === 0 ? (
          <EmptyState title="No projects match this signal">
            <p>Clear a filter or start the project you wish existed.</p>
            <Link to="/projects/new">Create a project</Link>
          </EmptyState>
        ) : null}
        {projectQuery.data?.items.length ? (
          <div className="project-grid">
            {projectQuery.data.items.map((project, index) => (
              <ProjectCard index={index} key={project.id} project={project} />
            ))}
          </div>
        ) : null}
      </section>

      <section className="manifesto page-frame">
        <p>THE BRIDGE MODEL</p>
        <ol>
          <li>
            <span>01</span>
            <strong>Find the work</strong>
            <p>Browse real problems with explicit roles, scope, and skills.</p>
          </li>
          <li>
            <span>02</span>
            <strong>Join with intent</strong>
            <p>Apply by explaining the contribution you want to own.</p>
          </li>
          <li>
            <span>03</span>
            <strong>Make it visible</strong>
            <p>Plan tasks, collaborate, and turn delivery into evidence.</p>
          </li>
        </ol>
      </section>
    </>
  );
};
