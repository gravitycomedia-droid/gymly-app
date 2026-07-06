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
  const { user, userDoc, superAdmin, loading, pendingGymSelection } = useAuth();

  if (loading) return <Spinner />;

  if (!user) return <Navigate to="/select-role" replace />;

  // Platform super-admins go straight to the control plane, regardless of role.
  if (superAdmin) return <Navigate to="/admin" replace />;

  if (userDoc?.role) {
    // Go directly to home — agreement is shown as non-blocking inline card on the home screen
    return <Navigate to={getHomeRoute(userDoc.role)} replace />;
  }

  // Multi-gym member who hasn't picked a gym this session — send them to the
  // gym picker, not owner registration.
  if (pendingGymSelection && pendingGymSelection.length > 0) {
    return <Navigate to="/member/select-gym" replace />;
  }

  // Authenticated but no user doc — likely new user, go to registration
  return <Navigate to="/owner/register" replace />;
};

export default AutoRedirect;
