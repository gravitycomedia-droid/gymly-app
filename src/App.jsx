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

// Phase 3 imports
import WorkoutPlanList from './pages/Trainer/WorkoutPlanList';
import WorkoutPlanBuilder from './pages/Trainer/WorkoutPlanBuilder';
import AssignWorkout from './pages/Trainer/AssignWorkout';
import MemberWorkoutScreen from './pages/MemberWorkout/MemberWorkout';
import MemberProgressScreen from './pages/MemberProgress/MemberProgress';
import MemberProfileScreen from './pages/MemberProfile/MemberProfile';
import MemberCardScreen from './pages/MemberCard/MemberCard';
import PublicCardScreen from './pages/PublicCard/PublicCard';

// Phase 4 imports
import PaymentList from './pages/Payments/PaymentList';
import AddPayment from './pages/Payments/AddPayment';
import PaymentDetail from './pages/Payments/PaymentDetail';
import Analytics from './pages/Analytics/Analytics';
import WhatsAppLogs from './pages/WhatsApp/WhatsAppLogs';
import AttendanceLogs from './pages/Attendance/AttendanceLogs';
import QRScanner from './pages/Scanner/QRScanner';
import TabletMode from './pages/Scanner/TabletMode';
import OwnerSettings from './pages/Settings/OwnerSettings';

import { seedPredefinedPlans } from './data/seedPlans';
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    // Seed predefined plans on first load
    seedPredefinedPlans();
  }, []);

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
            <Route path="/public/member/:id" element={<PublicCardScreen />} />

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
            <Route
              path="/trainer/workout-plans"
              element={<ProtectedRoute requiredPermission="view_assigned_members"><WorkoutPlanList /></ProtectedRoute>}
            />
            <Route
              path="/trainer/workout-plans/create"
              element={<ProtectedRoute requiredPermission="view_assigned_members"><WorkoutPlanBuilder /></ProtectedRoute>}
            />
            <Route
              path="/trainer/workout-plans/:planId"
              element={<ProtectedRoute requiredPermission="view_assigned_members"><WorkoutPlanBuilder /></ProtectedRoute>}
            />
            <Route
              path="/trainer/assign/:id"
              element={<ProtectedRoute requiredPermission="view_assigned_members"><AssignWorkout /></ProtectedRoute>}
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
            <Route
              path="/member/workout"
              element={<ProtectedRoute><MemberWorkoutScreen /></ProtectedRoute>}
            />
            <Route
              path="/member/progress"
              element={<ProtectedRoute><MemberProgressScreen /></ProtectedRoute>}
            />
            <Route
              path="/member/profile"
              element={<ProtectedRoute><MemberProfileScreen /></ProtectedRoute>}
            />
            <Route
              path="/member/card"
              element={<ProtectedRoute><MemberCardScreen /></ProtectedRoute>}
            />

            {/* Phase 4 — Payments */}
            <Route
              path="/owner/payments"
              element={<ProtectedRoute><PaymentList /></ProtectedRoute>}
            />
            <Route
              path="/owner/payments/add"
              element={<ProtectedRoute><AddPayment /></ProtectedRoute>}
            />
            <Route
              path="/owner/payments/:id"
              element={<ProtectedRoute><PaymentDetail /></ProtectedRoute>}
            />

            {/* Phase 4 — Analytics */}
            <Route
              path="/owner/analytics"
              element={<ProtectedRoute><Analytics /></ProtectedRoute>}
            />

            {/* Phase 4 — WhatsApp */}
            <Route
              path="/owner/whatsapp"
              element={<ProtectedRoute><WhatsAppLogs /></ProtectedRoute>}
            />

            {/* Phase 4 — Attendance */}
            <Route
              path="/owner/attendance"
              element={<ProtectedRoute><AttendanceLogs /></ProtectedRoute>}
            />

            {/* Phase 4 — QR Scanner */}
            <Route path="/scan" element={<ProtectedRoute><QRScanner /></ProtectedRoute>} />
            <Route path="/tablet" element={<ProtectedRoute><TabletMode /></ProtectedRoute>} />

            {/* Settings */}
            <Route
              path="/owner/settings"
              element={<ProtectedRoute><OwnerSettings /></ProtectedRoute>}
            />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
