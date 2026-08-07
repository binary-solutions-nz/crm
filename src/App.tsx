import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Login from './auth/Login';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Subscriptions from './pages/Subscriptions';
import Services from './pages/Services';
import Renewals from './pages/Renewals';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="boot-screen">
        <Loading label="Starting…" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/:clientId" element={<ClientDetail />} />
        <Route path="/subscriptions" element={<Subscriptions />} />
        <Route path="/services" element={<Services />} />
        <Route path="/renewals" element={<Renewals />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
