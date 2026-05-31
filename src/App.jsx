import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import AutoRedirect from './components/AutoRedirect';
import ProtectedRoute from './components/ProtectedRoute';
import PageTransition from './components/PageTransition';
import OwnerLayout from './components/layouts/OwnerLayout';
import MemberLayout from './components/layouts/MemberLayout';

// ── Lazy-loaded pages ──
const RoleSelection        = lazy(() => import('./pages/RoleSelection/RoleSelection'));
const OwnerLogin           = lazy(() => import('./pages/Login/OwnerLogin'));
const MemberLogin          = lazy(() => import('./pages/Login/MemberLogin'));
const GymRegistration      = lazy(() => import('./pages/GymRegistration/GymRegistration'));
const SetupChecklist       = lazy(() => import('./pages/SetupChecklist/SetupChecklist'));
const OwnerDashboard       = lazy(() => import('./pages/OwnerDashboard/OwnerDashboard'));
const MemberHome           = lazy(() => import('./pages/MemberHome/MemberHome'));
const MemberList           = lazy(() => import('./pages/Members/MemberList'));
const AddMember            = lazy(() => import('./pages/Members/AddMember'));
const MemberProfile        = lazy(() => import('./pages/Members/MemberProfile'));
const EditMember           = lazy(() => import('./pages/Members/EditMember'));
const StaffList            = lazy(() => import('./pages/Staff/StaffList'));
const AddStaff             = lazy(() => import('./pages/Staff/AddStaff'));
const TrainerDashboard     = lazy(() => import('./pages/RoleDashboards/TrainerDashboard'));
const ReceptionistDashboard = lazy(() => import('./pages/RoleDashboards/ReceptionistDashboard'));
const WorkoutPlanList      = lazy(() => import('./pages/Trainer/WorkoutPlanList'));
const WorkoutPlanBuilder   = lazy(() => import('./pages/Trainer/WorkoutPlanBuilder'));
const AssignWorkout        = lazy(() => import('./pages/Trainer/AssignWorkout'));
const MemberWorkoutScreen  = lazy(() => import('./pages/MemberWorkout/MemberWorkout'));
const MemberProgressScreen = lazy(() => import('./pages/MemberProgress/MemberProgress'));
const MemberProfileScreen  = lazy(() => import('./pages/MemberProfile/MemberProfile'));
const MemberEditProfileScreen = lazy(() => import('./pages/MemberProfile/EditProfile'));
const MemberNotificationsScreen = lazy(() => import('./pages/Notifications/Notifications'));
const MemberCardScreen     = lazy(() => import('./pages/MemberCard/MemberCard'));
const PublicCardScreen     = lazy(() => import('./pages/PublicCard/PublicCard'));
const MemberPayments       = lazy(() => import('./pages/MemberPayments/MemberPayments'));
const PaymentList          = lazy(() => import('./pages/Payments/PaymentList'));
const AddPayment           = lazy(() => import('./pages/Payments/AddPayment'));
const PaymentDetail        = lazy(() => import('./pages/Payments/PaymentDetail'));
const MembershipPlansList  = lazy(() => import('./pages/MembershipPlans/MembershipPlansList'));
const AddMembershipPlan    = lazy(() => import('./pages/MembershipPlans/AddMembershipPlan'));
const Analytics            = lazy(() => import('./pages/Analytics/Analytics'));
const WhatsAppLogs         = lazy(() => import('./pages/WhatsApp/WhatsAppLogs'));
const AttendanceLogs       = lazy(() => import('./pages/Attendance/AttendanceLogs'));
const QuickLinks           = lazy(() => import('./pages/Settings/QuickLinks'));
const Equipment            = lazy(() => import('./pages/Settings/Equipment'));
const QRScanner            = lazy(() => import('./pages/Scanner/QRScanner'));
const TabletMode           = lazy(() => import('./pages/Scanner/TabletMode'));
const OwnerSettings        = lazy(() => import('./pages/Settings/OwnerSettings'));
const SubscriptionPlans    = lazy(() => import('./pages/Subscription/SubscriptionPlans'));
const GymLandingPage       = lazy(() => import('./pages/Subscription/GymLandingPage'));
const OwnerSubscriptionPage = lazy(() => import('./pages/Subscription/OwnerSubscriptionPage'));
const LeadsDashboard       = lazy(() => import('./pages/OwnerDashboard/LeadsDashboard'));
const MemberAgreement      = lazy(() => import('./pages/Agreement/MemberAgreement'));
const AdminDashboard       = lazy(() => import('./pages/Admin/AdminDashboard'));
const SubscriptionGate     = lazy(() => import('./components/SubscriptionGate'));

// ── Loading Spinner (shown while lazy chunks load) ──
const PageSpinner = () => (
  <div className="screen" style={{ background: 'var(--grad-role)' }}>
    <div className="screen-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
    </div>
  </div>
);

// ── Animated Routes (needs useLocation inside BrowserRouter) ──
function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Suspense fallback={<PageSpinner />}>
        <Routes location={location} key={location.pathname}>
          {/* Auto-redirect based on auth state */}
          <Route path="/" element={<AutoRedirect />} />

          {/* Public routes */}
          <Route path="/select-role" element={<PageTransition><RoleSelection /></PageTransition>} />
          <Route path="/owner/login" element={<PageTransition><OwnerLogin /></PageTransition>} />
          <Route path="/member/login" element={<PageTransition><MemberLogin /></PageTransition>} />
          <Route path="/public/member/:id" element={<PageTransition><PublicCardScreen /></PageTransition>} />
          <Route path="/gym/:gymId" element={<PageTransition><GymLandingPage /></PageTransition>} />
          <Route path="/gym/:gymId/plans" element={<PageTransition><SubscriptionPlans /></PageTransition>} />

          {/* Owner registration */}
          <Route path="/owner/register" element={<PageTransition><GymRegistration /></PageTransition>} />
          <Route
            path="/owner/setup"
            element={<ProtectedRoute><PageTransition><SetupChecklist /></PageTransition></ProtectedRoute>}
          />

          {/* Owner dashboard */}
          <Route
            path="/owner/dashboard"
            element={<ProtectedRoute><OwnerLayout activeTab="home"><PageTransition><OwnerDashboard /></PageTransition></OwnerLayout></ProtectedRoute>}
          />
          <Route
            path="/owner/leads"
            element={<ProtectedRoute><OwnerLayout activeTab="members"><PageTransition><LeadsDashboard /></PageTransition></OwnerLayout></ProtectedRoute>}
          />

          {/* Owner — Members */}
          <Route
            path="/owner/members"
            element={<ProtectedRoute requiredPermission="view_members"><OwnerLayout activeTab="members"><PageTransition><MemberList role="owner" /></PageTransition></OwnerLayout></ProtectedRoute>}
          />
          <Route
            path="/owner/members/add"
            element={<ProtectedRoute requiredPermission="add_member"><OwnerLayout activeTab="members"><PageTransition><AddMember /></PageTransition></OwnerLayout></ProtectedRoute>}
          />
          <Route
            path="/owner/members/:id"
            element={<ProtectedRoute requiredPermission="view_members"><OwnerLayout activeTab="members"><PageTransition><MemberProfile /></PageTransition></OwnerLayout></ProtectedRoute>}
          />
          <Route
            path="/owner/members/:id/edit"
            element={<ProtectedRoute requiredPermission="edit_member"><OwnerLayout activeTab="members"><PageTransition><EditMember /></PageTransition></OwnerLayout></ProtectedRoute>}
          />

          {/* Owner — Staff */}
          <Route
            path="/owner/staff"
            element={<ProtectedRoute requiredPermission="view_staff"><OwnerLayout activeTab="settings"><PageTransition><StaffList /></PageTransition></OwnerLayout></ProtectedRoute>}
          />
          <Route
            path="/owner/staff/add"
            element={<ProtectedRoute requiredPermission="add_staff"><OwnerLayout activeTab="settings"><PageTransition><AddStaff /></PageTransition></OwnerLayout></ProtectedRoute>}
          />

          {/* Manager routes */}
          <Route
            path="/manager/members"
            element={<ProtectedRoute requiredPermission="view_members"><PageTransition><MemberList role="manager" /></PageTransition></ProtectedRoute>}
          />
          <Route
            path="/manager/members/add"
            element={<ProtectedRoute requiredPermission="add_member"><PageTransition><AddMember /></PageTransition></ProtectedRoute>}
          />
          <Route
            path="/manager/members/:id"
            element={<ProtectedRoute requiredPermission="view_members"><PageTransition><MemberProfile /></PageTransition></ProtectedRoute>}
          />

          {/* Trainer routes */}
          <Route
            path="/trainer/members"
            element={<ProtectedRoute requiredPermission="view_assigned_members"><PageTransition><TrainerDashboard /></PageTransition></ProtectedRoute>}
          />
          <Route
            path="/trainer/members/:id"
            element={<ProtectedRoute requiredPermission="view_assigned_members"><PageTransition><MemberProfile readOnly /></PageTransition></ProtectedRoute>}
          />
          <Route
            path="/trainer/workout-plans"
            element={<ProtectedRoute requiredPermission="view_assigned_members"><PageTransition><WorkoutPlanList /></PageTransition></ProtectedRoute>}
          />
          <Route
            path="/trainer/workout-plans/create"
            element={<ProtectedRoute requiredPermission="view_assigned_members"><PageTransition><WorkoutPlanBuilder /></PageTransition></ProtectedRoute>}
          />
          <Route
            path="/trainer/workout-plans/:planId"
            element={<ProtectedRoute requiredPermission="view_assigned_members"><PageTransition><WorkoutPlanBuilder /></PageTransition></ProtectedRoute>}
          />
          <Route
            path="/trainer/assign/:id"
            element={<ProtectedRoute requiredPermission="view_assigned_members"><PageTransition><AssignWorkout /></PageTransition></ProtectedRoute>}
          />

          {/* Receptionist routes */}
          <Route
            path="/receptionist"
            element={<ProtectedRoute requiredPermission="view_members"><PageTransition><ReceptionistDashboard /></PageTransition></ProtectedRoute>}
          />
          <Route
            path="/receptionist/members"
            element={<ProtectedRoute requiredPermission="view_members"><PageTransition><MemberList /></PageTransition></ProtectedRoute>}
          />
          <Route
            path="/receptionist/members/add"
            element={<ProtectedRoute requiredPermission="add_member"><PageTransition><AddMember quickAddOnly /></PageTransition></ProtectedRoute>}
          />

          {/* Member routes */}
          <Route path="/member/home" element={<ProtectedRoute><MemberLayout activeTab="home"><PageTransition><MemberHome /></PageTransition></MemberLayout></ProtectedRoute>} />
          <Route path="/member/workout" element={<ProtectedRoute><MemberLayout activeTab="workout"><PageTransition><MemberWorkoutScreen /></PageTransition></MemberLayout></ProtectedRoute>} />
          <Route path="/member/progress" element={<ProtectedRoute allowedRoles={['member']}><MemberLayout activeTab="progress"><PageTransition><MemberProgressScreen /></PageTransition></MemberLayout></ProtectedRoute>} />
          <Route path="/member/profile" element={<ProtectedRoute allowedRoles={['member']}><MemberLayout activeTab="profile"><PageTransition><MemberProfileScreen /></PageTransition></MemberLayout></ProtectedRoute>} />
          <Route path="/member/edit-profile" element={<ProtectedRoute allowedRoles={['member']}><MemberLayout activeTab="profile"><PageTransition><MemberEditProfileScreen /></PageTransition></MemberLayout></ProtectedRoute>} />
          <Route path="/member/notifications" element={<ProtectedRoute allowedRoles={['member']}><MemberLayout activeTab="home"><PageTransition><MemberNotificationsScreen /></PageTransition></MemberLayout></ProtectedRoute>} />
          <Route path="/member/card" element={<ProtectedRoute allowedRoles={['member']}><MemberLayout activeTab="profile"><PageTransition><MemberCardScreen /></PageTransition></MemberLayout></ProtectedRoute>} />
          <Route path="/member/payments" element={<ProtectedRoute allowedRoles={['member']}><MemberLayout activeTab="profile"><PageTransition><MemberPayments /></PageTransition></MemberLayout></ProtectedRoute>} />
          <Route path="/member/agreement" element={<ProtectedRoute allowedRoles={['member']}><MemberLayout activeTab="profile"><PageTransition><MemberAgreement /></PageTransition></MemberLayout></ProtectedRoute>} />

          {/* Phase 4 — Payments */}
          <Route
            path="/owner/payments"
            element={
              <ProtectedRoute>
                <OwnerLayout activeTab="payments">
                  <Suspense fallback={<PageSpinner />}>
                    <SubscriptionGate feature="payments"><PageTransition><PaymentList /></PageTransition></SubscriptionGate>
                  </Suspense>
                </OwnerLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/owner/payments/add"
            element={
              <ProtectedRoute>
                <OwnerLayout activeTab="payments">
                  <Suspense fallback={<PageSpinner />}>
                    <SubscriptionGate feature="payments"><PageTransition><AddPayment /></PageTransition></SubscriptionGate>
                  </Suspense>
                </OwnerLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/owner/payments/:id"
            element={
              <ProtectedRoute>
                <OwnerLayout activeTab="payments">
                  <Suspense fallback={<PageSpinner />}>
                    <SubscriptionGate feature="payments"><PageTransition><PaymentDetail /></PageTransition></SubscriptionGate>
                  </Suspense>
                </OwnerLayout>
              </ProtectedRoute>
            }
          />

          {/* Phase 4 — Analytics */}
          <Route
            path="/owner/analytics"
            element={
              <ProtectedRoute>
                <OwnerLayout activeTab="analytics">
                  <Suspense fallback={<PageSpinner />}>
                    <SubscriptionGate feature="analytics"><PageTransition><Analytics /></PageTransition></SubscriptionGate>
                  </Suspense>
                </OwnerLayout>
              </ProtectedRoute>
            }
          />

          {/* Phase 4 — WhatsApp */}
          <Route
            path="/owner/whatsapp"
            element={
              <ProtectedRoute>
                <OwnerLayout activeTab="settings">
                  <Suspense fallback={<PageSpinner />}>
                    <SubscriptionGate feature="whatsapp_automation"><PageTransition><WhatsAppLogs /></PageTransition></SubscriptionGate>
                  </Suspense>
                </OwnerLayout>
              </ProtectedRoute>
            }
          />

          {/* Phase 4 — Attendance */}
          <Route
            path="/owner/attendance"
            element={
              <ProtectedRoute>
                <OwnerLayout activeTab="analytics">
                  <Suspense fallback={<PageSpinner />}>
                    <SubscriptionGate feature="attendance_heatmap"><PageTransition><AttendanceLogs /></PageTransition></SubscriptionGate>
                  </Suspense>
                </OwnerLayout>
              </ProtectedRoute>
            }
          />

          {/* Phase 4 — QR Scanner */}
          <Route path="/scan" element={<ProtectedRoute><PageTransition><QRScanner /></PageTransition></ProtectedRoute>} />
          <Route path="/tablet" element={<ProtectedRoute><PageTransition><TabletMode /></PageTransition></ProtectedRoute>} />

          {/* Owner Subscription */}
          <Route
            path="/owner/subscription"
            element={<ProtectedRoute allowedRoles={['owner']}><PageTransition><OwnerSubscriptionPage /></PageTransition></ProtectedRoute>}
          />

          {/* Super-Admin Portal */}
          <Route
            path="/admin"
            element={<ProtectedRoute allowedRoles={['admin']}><PageTransition><AdminDashboard /></PageTransition></ProtectedRoute>}
          />

          {/* Settings */}
          <Route
            path="/owner/settings"
            element={<ProtectedRoute><OwnerLayout activeTab="settings"><PageTransition><OwnerSettings /></PageTransition></OwnerLayout></ProtectedRoute>}
          />
          <Route
            path="/owner/settings/quick-links"
            element={<ProtectedRoute allowedRoles={['owner']}><OwnerLayout activeTab="settings"><PageTransition><QuickLinks /></PageTransition></OwnerLayout></ProtectedRoute>}
          />
          <Route
            path="/owner/settings/equipment"
            element={<ProtectedRoute allowedRoles={['owner']}><OwnerLayout activeTab="settings"><PageTransition><Equipment /></PageTransition></OwnerLayout></ProtectedRoute>}
          />

          {/* Membership Plans */}
          <Route
            path="/owner/plans"
            element={<ProtectedRoute allowedRoles={['owner']}><OwnerLayout activeTab="settings"><PageTransition><MembershipPlansList /></PageTransition></OwnerLayout></ProtectedRoute>}
          />
          <Route
            path="/owner/plans/add"
            element={<ProtectedRoute allowedRoles={['owner']}><OwnerLayout activeTab="settings"><PageTransition><AddMembershipPlan /></PageTransition></OwnerLayout></ProtectedRoute>}
          />
          <Route
            path="/owner/plans/edit/:planId"
            element={<ProtectedRoute allowedRoles={['owner']}><OwnerLayout activeTab="settings"><PageTransition><AddMembershipPlan /></PageTransition></OwnerLayout></ProtectedRoute>}
          />
        </Routes>
      </Suspense>
    </AnimatePresence>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AnimatedRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
