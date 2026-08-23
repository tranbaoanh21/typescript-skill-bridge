import { ArrowUpRight, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { Project } from '../lib/types';
import { StatusPill } from './ui';

export const ProjectCard = ({ index, project }: { index: number; project: Project }) => {
  const spotsLeft = Math.max(project.capacity - project.memberCount, 0);
  return (
    <article className="project-card">
      <div className="project-card__index">{String(index + 1).padStart(2, '0')}</div>
      <div className="project-card__body">
        <div className="project-card__meta">
          <StatusPill tone="good">Recruiting</StatusPill>
          <span>
            <UsersRound size={14} />
            {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left
          </span>
        </div>
        <h2>
          <Link to={`/projects/${project.slug}`}>{project.title}</Link>
        </h2>
        <p>{project.description}</p>
        <ul aria-label="Required skills">
          {project.requiredSkills.slice(0, 4).map((skill) => (
            <li key={skill.skillId}>{skill.name}</li>
          ))}
        </ul>
        <div className="project-card__footer">
          <span>Led by {project.ownerDisplayName}</span>
          <Link aria-label={`View ${project.title}`} to={`/projects/${project.slug}`}>
            <ArrowUpRight size={18} />
          </Link>
        </div>
      </div>
    </article>
  );
};
