import { ArrowRight, Compass, FolderKanban, LogOut, Menu, Plus, UserRound, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';

import { useSession } from '../lib/session';

const navItems = [
  { icon: Compass, label: 'Discover', to: '/' },
  { icon: FolderKanban, label: 'Applications', to: '/applications' },
  { icon: UserRound, label: 'Profile', to: '/profile' },
];

const apiDocsUrl = import.meta.env['VITE_API_DOCS_URL'] ?? 'http://localhost:3000/docs';

export const AppShell = ({ children }: { children: ReactNode }) => {
  const { logout, session } = useSession();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="site-shell">
      <header className="site-header">
        <Link aria-label="SkillBridge home" className="wordmark" to="/">
          <span>SB</span>
          <b>
            HCMUT
            <br />
            SkillBridge
          </b>
        </Link>
        <nav
          aria-label="Primary navigation"
          className={menuOpen ? 'primary-nav is-open' : 'primary-nav'}
        >
          {navItems.map(({ icon: Icon, label, to }) => (
            <NavLink key={to} onClick={() => setMenuOpen(false)} to={to}>
              <Icon aria-hidden="true" size={15} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
          {session ? (
            <>
              <Link className="create-link" to="/projects/new">
                <Plus size={15} />
                New project
              </Link>
              <button
                aria-label="Log out"
                className="icon-button"
                onClick={() => void logout().then(() => navigate('/'))}
                type="button"
              >
                <LogOut size={17} />
              </button>
            </>
          ) : (
            <>
              <Link className="login-link" to="/login">
                Log in
              </Link>
              <Link className="join-link" to="/register">
                Join the bridge
              </Link>
            </>
          )}
          <button
            aria-expanded={menuOpen}
            aria-label="Toggle navigation"
            className="menu-button"
            onClick={() => setMenuOpen((value) => !value)}
            type="button"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        <p>Built by students, for the work between lectures.</p>
        <div>
          <span>HCMUT</span>
          <span>2026</span>
          <a href={apiDocsUrl}>API docs</a>
        </div>
      </footer>
    </div>
  );
};

export const Protected = ({ children }: { children: ReactNode }) => {
  const { session } = useSession();
  if (!session) {
    return (
      <section className="protected-callout page-frame">
        <p className="eyebrow">Members only</p>
        <h1>
          Cross the bridge
          <br />
          to continue.
        </h1>
        <p>Sign in to manage your profile, applications, projects, and team workspace.</p>
        <Link className="button button--primary" to="/login">
          <span>Log in</span>
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>
    );
  }
  return children;
};
