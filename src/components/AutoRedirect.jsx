import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getHomeRoute } from '../utils/permissions';

const Spinner = () => (
  <div className="screen" style={{ background: 'var(--grad-role)' }}>
    <div className="screen-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
    </div>
  </div>
);

const AutoRedirect = () => {
  const { user, userDoc, loading } = useAuth();

  if (loading) return <Spinner />;

  if (!user) return <Navigate to="/select-role" replace />;

  if (userDoc?.role) {
    return <Navigate to={getHomeRoute(userDoc.role)} replace />;
  }

  // Authenticated but no user doc — likely new user, go to registration
  return <Navigate to="/owner/register" replace />;
};

export default AutoRedirect;
