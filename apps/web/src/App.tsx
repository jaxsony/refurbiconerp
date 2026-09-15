import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useAuth } from './lib/auth-store';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage, TenantsPage, UsersPage } from './pages/Pages';
import { QuoteToCashPage } from './pages/Operations';
import { AutomationHubPage, DispatchHubPage, FieldPage, GoLivePage, PeopleHubPage, ServiceHubPage } from './pages/Phases';
import { CrudFormPage, CrudListPage, CrudViewPage } from './pages/Crud';
import { CompanyDeletedPage } from './pages/CompanyPage';

const queryClient = new QueryClient();

function Private({ children }: { children: ReactNode }) {
  const token = useAuth((s) => s.accessToken);
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <Private>
              <AppShell />
            </Private>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="quote-to-cash" element={<QuoteToCashPage />} />
          <Route path="people-ops" element={<PeopleHubPage />} />
          <Route path="service" element={<ServiceHubPage />} />
          <Route path="dispatch" element={<DispatchHubPage />} />
          <Route path="automation" element={<AutomationHubPage />} />
          <Route path="field" element={<FieldPage />} />
          <Route path="go-live" element={<GoLivePage />} />
          <Route path="tenants" element={<TenantsPage />} />
          <Route path="select-tenant" element={<TenantsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="company" element={<CompanyDeletedPage />} />
          <Route path=":slug" element={<CrudListPage />} />
          <Route path=":slug/new" element={<CrudFormPage mode="create" />} />
          <Route path=":slug/:id" element={<CrudViewPage />} />
          <Route path=":slug/:id/edit" element={<CrudFormPage mode="edit" />} />
        </Route>
      </Routes>
    </QueryClientProvider>
  );
}
