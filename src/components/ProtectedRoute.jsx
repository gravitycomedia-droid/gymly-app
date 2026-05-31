import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { can } from '../utils/permissions';
import AccessRestricted from './AccessRestricted';

const ProtectedRoute = ({ children, requiredRole, allowedRoles, requiredPermission }) => {
  const { user, userDoc, loading } = useAuth();

  if (loading) {
    return (
      <div className="screen" style={{ background: 'var(--grad-role)' }}>
        <div className="screen-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/select-role" replace />;

  // Single role check
  if (requiredRole && userDoc?.role !== requiredRole) {
    return <AccessRestricted message={`This page is for ${requiredRole}s only.`} />;
  }

  // Multi-role check (allowedRoles array)
  if (allowedRoles && !allowedRoles.includes(userDoc?.role)) {
    return <AccessRestricted message={`Access restricted to: ${allowedRoles.join(', ')}.`} />;
  }

  // Permission check
  if (requiredPermission && !can(userDoc, requiredPermission)) {
    return <AccessRestricted />;
  }

  return children;
};

export default ProtectedRoute;
