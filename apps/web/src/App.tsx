import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';

import { AppShell, Protected } from './components/AppShell';
import { SessionProvider } from './lib/session';
import { ApplicationsPage } from './pages/ApplicationsPage';
import { AuthPage } from './pages/AuthPage';
import { CreateProjectPage } from './pages/CreateProjectPage';
import { DiscoveryPage } from './pages/DiscoveryPage';
import { ProfilePage } from './pages/ProfilePage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectManagementPage } from './pages/ProjectManagementPage';
import { WorkspacePage } from './pages/WorkspacePage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 15_000 },
  },
});

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ behavior: 'auto', top: 0 });
  }, [pathname]);
  return null;
};

const ApplicationRoutes = () => (
  <AppShell>
    <ScrollToTop />
    <Routes>
      <Route element={<DiscoveryPage />} path="/" />
      <Route element={<AuthPage mode="login" />} path="/login" />
      <Route element={<AuthPage mode="register" />} path="/register" />
      <Route element={<ProjectDetailPage />} path="/projects/:slug" />
      <Route
        element={
          <Protected>
            <CreateProjectPage />
          </Protected>
        }
        path="/projects/new"
      />
      <Route
        element={
          <Protected>
            <ProjectManagementPage />
          </Protected>
        }
        path="/projects/manage/:projectId"
      />
      <Route
        element={
          <Protected>
            <ProfilePage />
          </Protected>
        }
        path="/profile"
      />
      <Route
        element={
          <Protected>
            <ApplicationsPage />
          </Protected>
        }
        path="/applications"
      />
      <Route
        element={
          <Protected>
            <WorkspacePage />
          </Protected>
        }
        path="/workspace/:projectId"
      />
      <Route
        element={
          <section className="not-found page-frame">
            <span>404</span>
            <h1>This bridge ends here.</h1>
            <a href="/">Return to the project board</a>
          </section>
        }
        path="*"
      />
    </Routes>
  </AppShell>
);

export const App = () => (
  <QueryClientProvider client={queryClient}>
    <SessionProvider>
      <BrowserRouter>
        <ApplicationRoutes />
      </BrowserRouter>
    </SessionProvider>
  </QueryClientProvider>
);
