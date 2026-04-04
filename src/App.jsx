import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import AutoRedirect from './components/AutoRedirect';
import ProtectedRoute from './components/ProtectedRoute';
import RoleSelection from './pages/RoleSelection/RoleSelection';
import OwnerLogin from './pages/Login/OwnerLogin';
import MemberLogin from './pages/Login/MemberLogin';
import GymRegistration from './pages/GymRegistration/GymRegistration';
import SetupChecklist from './pages/SetupChecklist/SetupChecklist';
import OwnerDashboard from './pages/OwnerDashboard/OwnerDashboard';
import MemberHome from './pages/MemberHome/MemberHome';

// Phase 2 imports
import MemberList from './pages/Members/MemberList';
import AddMember from './pages/Members/AddMember';
import MemberProfile from './pages/Members/MemberProfile';
import EditMember from './pages/Members/EditMember';
import StaffList from './pages/Staff/StaffList';
import AddStaff from './pages/Staff/AddStaff';
import TrainerDashboard from './pages/RoleDashboards/TrainerDashboard';
import ReceptionistDashboard from './pages/RoleDashboards/ReceptionistDashboard';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Auto-redirect based on auth state */}
            <Route path="/" element={<AutoRedirect />} />

            {/* Public routes */}
            <Route path="/select-role" element={<RoleSelection />} />
            <Route path="/owner/login" element={<OwnerLogin />} />
            <Route path="/member/login" element={<MemberLogin />} />

            {/* Owner registration */}
            <Route path="/owner/register" element={<GymRegistration />} />
            <Route
              path="/owner/setup"
              element={<ProtectedRoute><SetupChecklist /></ProtectedRoute>}
            />

            {/* Owner dashboard */}
            <Route
              path="/owner/dashboard"
              element={<ProtectedRoute><OwnerDashboard /></ProtectedRoute>}
            />

            {/* Owner — Members */}
            <Route
              path="/owner/members"
              element={<ProtectedRoute requiredPermission="view_members"><MemberList role="owner" /></ProtectedRoute>}
            />
            <Route
              path="/owner/members/add"
              element={<ProtectedRoute requiredPermission="add_member"><AddMember /></ProtectedRoute>}
            />
            <Route
              path="/owner/members/:id"
              element={<ProtectedRoute requiredPermission="view_members"><MemberProfile /></ProtectedRoute>}
            />
            <Route
              path="/owner/members/:id/edit"
              element={<ProtectedRoute requiredPermission="edit_member"><EditMember /></ProtectedRoute>}
            />

            {/* Owner — Staff */}
            <Route
              path="/owner/staff"
              element={<ProtectedRoute requiredPermission="view_staff"><StaffList /></ProtectedRoute>}
            />
            <Route
              path="/owner/staff/add"
              element={<ProtectedRoute requiredPermission="add_staff"><AddStaff /></ProtectedRoute>}
            />

            {/* Manager routes */}
            <Route
              path="/manager/members"
              element={<ProtectedRoute requiredPermission="view_members"><MemberList role="manager" /></ProtectedRoute>}
            />
            <Route
              path="/manager/members/add"
              element={<ProtectedRoute requiredPermission="add_member"><AddMember /></ProtectedRoute>}
            />
            <Route
              path="/manager/members/:id"
              element={<ProtectedRoute requiredPermission="view_members"><MemberProfile /></ProtectedRoute>}
            />

            {/* Trainer routes */}
            <Route
              path="/trainer/members"
              element={<ProtectedRoute requiredPermission="view_assigned_members"><TrainerDashboard /></ProtectedRoute>}
            />
            <Route
              path="/trainer/members/:id"
              element={<ProtectedRoute requiredPermission="view_assigned_members"><MemberProfile readOnly /></ProtectedRoute>}
            />

            {/* Receptionist routes */}
            <Route
              path="/receptionist/members"
              element={<ProtectedRoute requiredPermission="view_members"><ReceptionistDashboard /></ProtectedRoute>}
            />
            <Route
              path="/receptionist/members/add"
              element={<ProtectedRoute requiredPermission="add_member"><AddMember quickAddOnly /></ProtectedRoute>}
            />

            {/* Member routes */}
            <Route
              path="/member/home"
              element={<ProtectedRoute><MemberHome /></ProtectedRoute>}
            />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
