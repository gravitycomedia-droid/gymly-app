import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import AutoRedirect from './components/AutoRedirect';
import ProtectedRoute from './components/ProtectedRoute';
import PageTransition from './components/PageTransition';
import OwnerShell from './owner/OwnerShell';
import MemberLayout from './components/layouts/MemberLayout';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import { importOwnerDashboard } from './routePreload';

// ── Lazy-loaded pages ──
const RoleSelection        = lazy(() => import('./pages/RoleSelection/RoleSelection'));
const OwnerLogin           = lazy(() => import('./pages/Login/OwnerLogin'));
const MemberLogin          = lazy(() => import('./pages/Login/MemberLogin'));
const SelectGym            = lazy(() => import('./pages/Login/SelectGym'));
const GymRegistration      = lazy(() => import('./pages/GymRegistration/GymRegistration'));
const SetupChecklist       = lazy(() => import('./pages/SetupChecklist/SetupChecklist'));
const MemberHome           = lazy(() => import('./pages/MemberHome/MemberHome'));
const MemberList           = lazy(() => import('./pages/Members/MemberList'));
const AddMember            = lazy(() => import('./pages/Members/AddMember'));
const MemberProfile        = lazy(() => import('./pages/Members/MemberProfile'));
const EditMember           = lazy(() => import('./pages/Members/EditMember'));
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
const QRScanner            = lazy(() => import('./pages/Scanner/QRScanner'));
const TabletMode           = lazy(() => import('./pages/Scanner/TabletMode'));
const SubscriptionPlans    = lazy(() => import('./pages/Subscription/SubscriptionPlans'));
const GymLandingPage       = lazy(() => import('./pages/Subscription/GymLandingPage'));
const MemberAgreement      = lazy(() => import('./pages/Agreement/MemberAgreement'));
const SuperAdminDashboard  = lazy(() => import('./pages/Admin/SuperAdminDashboard'));
const BroadcastsPage       = lazy(() => import('./pages/Admin/BroadcastsPage'));
const PlansPage            = lazy(() => import('./pages/Admin/PlansPage'));
const SubscriptionGate     = lazy(() => import('./components/SubscriptionGate'));
const EntryKiosk           = lazy(() => import('./pages/Kiosk/EntryKiosk'));
const ExitKiosk            = lazy(() => import('./pages/Kiosk/ExitKiosk'));

// ── Owner frontend v2 (Gymloop redesign) — owner-only, new files, same backend ──
const OwnerDashboardV2     = lazy(() => import('./owner/screens/Dashboard'));
const OwnerLeadsV2         = lazy(() => import('./owner/screens/Leads'));
const OwnerMembersListV2   = lazy(() => import('./owner/screens/Members/MembersList'));
const OwnerAddMemberV2     = lazy(() => import('./owner/screens/Members/AddMember'));
const OwnerMemberProfileV2 = lazy(() => import('./owner/screens/Members/MemberProfile'));
const OwnerEditMemberV2    = lazy(() => import('./owner/screens/Members/EditMember'));
const OwnerRecycleBinV2    = lazy(() => import('./owner/screens/Members/RecycleBin'));
const OwnerPaymentsListV2  = lazy(() => import('./owner/screens/Payments/PaymentsList'));
const OwnerAddPaymentV2    = lazy(() => import('./owner/screens/Payments/AddPayment'));
const OwnerPaymentDetailV2 = lazy(() => import('./owner/screens/Payments/PaymentDetail'));
const OwnerMemberPaymentHistoryV2 = lazy(() => import('./owner/screens/Payments/MemberPaymentHistory'));
const OwnerStaffListV2     = lazy(() => import('./owner/screens/Staff/StaffList'));
const OwnerAddStaffV2      = lazy(() => import('./owner/screens/Staff/AddStaff'));
const OwnerAnalyticsV2     = lazy(() => import('./owner/screens/Analytics'));
const OwnerWhatsAppLogV2   = lazy(() => import('./owner/screens/WhatsAppLog'));
const OwnerAttendanceLogsV2 = lazy(() => import('./owner/screens/Attendance/AttendanceLogs'));
const OwnerKioskDevicesV2  = lazy(() => import('./owner/screens/Attendance/KioskDevices'));
const OwnerSettingsHubV2   = lazy(() => import('./owner/screens/Settings/SettingsHub'));
const OwnerQuickLinksV2    = lazy(() => import('./owner/screens/Settings/QuickLinks'));
const OwnerEquipmentV2     = lazy(() => import('./owner/screens/Settings/Equipment'));
const OwnerNumberingSettingsV2 = lazy(() => import('./owner/screens/Settings/NumberingSettings'));
const OwnerCardDesignV2    = lazy(() => import('./owner/screens/Settings/CardDesign'));
const OwnerPlansListV2     = lazy(() => import('./owner/screens/Plans/PlansList'));
const OwnerAddPlanV2       = lazy(() => import('./owner/screens/Plans/AddPlan'));
const OwnerSubscriptionV2  = lazy(() => import('./owner/screens/Subscription'));

import WorkoutGate from './components/WorkoutGate';
import AppLoader from './components/AppLoader';

// ── Animated Routes (needs useLocation inside BrowserRouter) ──
function AnimatedRoutes() {
  const location = useLocation();

  return (
    <Suspense fallback={<AppLoader />}>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          {/* Auto-redirect based on auth state */}
          <Route path="/" element={<AutoRedirect />} />

          {/* Public routes */}
          <Route path="/select-role" element={<PageTransition><RoleSelection /></PageTransition>} />
          <Route path="/owner/login" element={<PageTransition><OwnerLogin /></PageTransition>} />
          <Route path="/member/login" element={<PageTransition><MemberLogin /></PageTransition>} />
          <Route path="/member/select-gym" element={<PageTransition><SelectGym /></PageTransition>} />
          <Route path="/public/member/:id" element={<PageTransition><PublicCardScreen /></PageTransition>} />
          <Route path="/gym/:gymId" element={<PageTransition><GymLandingPage /></PageTransition>} />
          <Route path="/gym/:gymId/plans" element={<PageTransition><SubscriptionPlans /></PageTransition>} />

          {/* Owner registration */}
          <Route path="/owner/register" element={<PageTransition><GymRegistration /></PageTransition>} />
          <Route
            path="/owner/setup"
            element={<ProtectedRoute><PageTransition><SetupChecklist /></PageTransition></ProtectedRoute>}
          />

          {/* Owner dashboard — Gymloop v2 shell */}
          <Route
            path="/owner/dashboard"
            element={<ProtectedRoute allowedRoles={['owner']} preload={importOwnerDashboard}><OwnerShell activeTab="home"><PageTransition><OwnerDashboardV2 /></PageTransition></OwnerShell></ProtectedRoute>}
          />
          <Route
            path="/owner/leads"
            element={<ProtectedRoute allowedRoles={['owner']}><OwnerShell activeTab="home"><PageTransition><OwnerLeadsV2 /></PageTransition></OwnerShell></ProtectedRoute>}
          />

          {/* Owner — Members (Gymloop v2 shell; manager/receptionist/trainer keep the routes further below on the old pages) */}
          <Route
            path="/owner/members"
            element={<ProtectedRoute requiredPermission="view_members"><OwnerShell activeTab="members"><PageTransition><OwnerMembersListV2 /></PageTransition></OwnerShell></ProtectedRoute>}
          />
          <Route
            path="/owner/members/add"
            element={<ProtectedRoute requiredPermission="add_member"><OwnerShell activeTab="members"><PageTransition><OwnerAddMemberV2 /></PageTransition></OwnerShell></ProtectedRoute>}
          />
          <Route
            path="/owner/members/:id"
            element={<ProtectedRoute requiredPermission="view_members"><OwnerShell activeTab="members"><PageTransition><OwnerMemberProfileV2 /></PageTransition></OwnerShell></ProtectedRoute>}
          />
          <Route
            path="/owner/members/:id/edit"
            element={<ProtectedRoute requiredPermission="edit_member"><OwnerShell activeTab="members"><PageTransition><OwnerEditMemberV2 /></PageTransition></OwnerShell></ProtectedRoute>}
          />
          <Route
            path="/owner/recycle-bin"
            element={<ProtectedRoute requiredPermission="delete_member"><OwnerShell activeTab="members"><PageTransition><OwnerRecycleBinV2 /></PageTransition></OwnerShell></ProtectedRoute>}
          />

          {/* Owner — Staff (Gymloop v2 shell) */}
          <Route
            path="/owner/staff"
            element={<ProtectedRoute requiredPermission="view_staff"><OwnerShell activeTab="settings"><PageTransition><OwnerStaffListV2 /></PageTransition></OwnerShell></ProtectedRoute>}
          />
          <Route
            path="/owner/staff/add"
            element={<ProtectedRoute requiredPermission="add_staff"><OwnerShell activeTab="settings"><PageTransition><OwnerAddStaffV2 /></PageTransition></OwnerShell></ProtectedRoute>}
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
            element={<ProtectedRoute requiredPermission="view_members"><PageTransition><MemberList role="receptionist" /></PageTransition></ProtectedRoute>}
          />
          <Route
            path="/receptionist/members/add"
            element={<ProtectedRoute requiredPermission="add_member"><PageTransition><AddMember /></PageTransition></ProtectedRoute>}
          />
          <Route
            path="/receptionist/members/:id"
            element={<ProtectedRoute requiredPermission="view_members"><PageTransition><MemberProfile /></PageTransition></ProtectedRoute>}
          />
          <Route
            path="/receptionist/members/:id/edit"
            element={<ProtectedRoute requiredPermission="edit_member"><PageTransition><EditMember /></PageTransition></ProtectedRoute>}
          />

          {/* Member routes */}
          <Route path="/member/home" element={<ProtectedRoute><MemberLayout activeTab="home"><PageTransition><MemberHome /></PageTransition></MemberLayout></ProtectedRoute>} />
          <Route path="/member/workout" element={<ProtectedRoute><MemberLayout activeTab="workout"><PageTransition><WorkoutGate><MemberWorkoutScreen /></WorkoutGate></PageTransition></MemberLayout></ProtectedRoute>} />
          <Route path="/member/progress" element={<ProtectedRoute allowedRoles={['member']}><MemberLayout activeTab="progress"><PageTransition><WorkoutGate><MemberProgressScreen /></WorkoutGate></PageTransition></MemberLayout></ProtectedRoute>} />
          <Route path="/member/profile" element={<ProtectedRoute allowedRoles={['member']}><MemberLayout activeTab="profile"><PageTransition><MemberProfileScreen /></PageTransition></MemberLayout></ProtectedRoute>} />
          <Route path="/member/edit-profile" element={<ProtectedRoute allowedRoles={['member']}><MemberLayout activeTab="profile"><PageTransition><MemberEditProfileScreen /></PageTransition></MemberLayout></ProtectedRoute>} />
          <Route path="/member/notifications" element={<ProtectedRoute allowedRoles={['member']}><MemberLayout activeTab="home"><PageTransition><MemberNotificationsScreen /></PageTransition></MemberLayout></ProtectedRoute>} />
          <Route path="/member/card" element={<ProtectedRoute allowedRoles={['member']}><MemberLayout activeTab="profile"><PageTransition><MemberCardScreen /></PageTransition></MemberLayout></ProtectedRoute>} />
          <Route path="/member/payments" element={<ProtectedRoute allowedRoles={['member']}><MemberLayout activeTab="profile"><PageTransition><MemberPayments /></PageTransition></MemberLayout></ProtectedRoute>} />
          <Route path="/member/agreement" element={<ProtectedRoute allowedRoles={['member']}><MemberLayout activeTab="profile"><PageTransition><MemberAgreement /></PageTransition></MemberLayout></ProtectedRoute>} />

          {/* Phase 4 — Payments (Gymloop v2 shell) */}
          <Route
            path="/owner/payments"
            element={
              <ProtectedRoute requiredPermission="view_payments">
                <OwnerShell activeTab="payments">
                  <SubscriptionGate feature="payments"><PageTransition><OwnerPaymentsListV2 /></PageTransition></SubscriptionGate>
                </OwnerShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/owner/payments/add"
            element={
              <ProtectedRoute requiredPermission="view_payments">
                <OwnerShell activeTab="payments">
                  <SubscriptionGate feature="payments"><PageTransition><OwnerAddPaymentV2 /></PageTransition></SubscriptionGate>
                </OwnerShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/owner/payments/member/:memberId"
            element={
              <ProtectedRoute requiredPermission="view_payments">
                <OwnerShell activeTab="payments">
                  <SubscriptionGate feature="payments"><PageTransition><OwnerMemberPaymentHistoryV2 /></PageTransition></SubscriptionGate>
                </OwnerShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/owner/payments/:id"
            element={
              <ProtectedRoute requiredPermission="view_payments">
                <OwnerShell activeTab="payments">
                  <SubscriptionGate feature="payments"><PageTransition><OwnerPaymentDetailV2 /></PageTransition></SubscriptionGate>
                </OwnerShell>
              </ProtectedRoute>
            }
          />

          {/* Phase 4 — Analytics (Gymloop v2 shell) */}
          <Route
            path="/owner/analytics"
            element={
              <ProtectedRoute requiredPermission="view_analytics">
                <OwnerShell activeTab="analytics">
                  <SubscriptionGate feature="analytics"><PageTransition><OwnerAnalyticsV2 /></PageTransition></SubscriptionGate>
                </OwnerShell>
              </ProtectedRoute>
            }
          />

          {/* Phase 4 — WhatsApp (Gymloop v2 shell) */}
          <Route
            path="/owner/whatsapp"
            element={
              <ProtectedRoute allowedRoles={['owner']}>
                <OwnerShell activeTab="settings">
                  <SubscriptionGate feature="whatsapp_automation"><PageTransition><OwnerWhatsAppLogV2 /></PageTransition></SubscriptionGate>
                </OwnerShell>
              </ProtectedRoute>
            }
          />

          {/* Phase 4 — Attendance (Gymloop v2 shell) */}
          <Route
            path="/owner/attendance"
            element={
              <ProtectedRoute requiredPermission="view_analytics">
                <OwnerShell activeTab="analytics">
                  <SubscriptionGate feature="attendance_heatmap"><PageTransition><OwnerAttendanceLogsV2 /></PageTransition></SubscriptionGate>
                </OwnerShell>
              </ProtectedRoute>
            }
          />

          {/* Phase 4 — QR Scanner */}
          <Route path="/scan" element={<ProtectedRoute><PageTransition><QRScanner /></PageTransition></ProtectedRoute>} />
          <Route path="/tablet" element={<ProtectedRoute><PageTransition><TabletMode /></PageTransition></ProtectedRoute>} />

          {/* Phase 5 — Kiosk (public, no auth required) */}
          <Route path="/kiosk/entry" element={<Suspense fallback={<AppLoader />}><EntryKiosk /></Suspense>} />
          <Route path="/kiosk/exit" element={<Suspense fallback={<AppLoader />}><ExitKiosk /></Suspense>} />

          {/* Phase 5 — Kiosk Device Management (protected, Gymloop v2 shell) */}
          <Route
            path="/owner/kiosk-devices"
            element={
              <ProtectedRoute allowedRoles={['owner']}>
                <OwnerShell activeTab="settings">
                  <SubscriptionGate feature="kiosk_attendance"><PageTransition><OwnerKioskDevicesV2 /></PageTransition></SubscriptionGate>
                </OwnerShell>
              </ProtectedRoute>
            }
          />

          {/* Owner Subscription (Gymloop v2 shell) */}
          <Route
            path="/owner/subscription"
            element={<ProtectedRoute allowedRoles={['owner']}><OwnerShell activeTab="settings"><PageTransition><OwnerSubscriptionV2 /></PageTransition></OwnerShell></ProtectedRoute>}
          />

          {/* Super-Admin Portal — platform control plane (super_admin claim) */}
          <Route
            path="/admin"
            element={<ProtectedRoute requireSuperAdmin><PageTransition><SuperAdminDashboard /></PageTransition></ProtectedRoute>}
          />
          <Route
            path="/admin/broadcasts"
            element={<ProtectedRoute requireSuperAdmin><PageTransition><BroadcastsPage /></PageTransition></ProtectedRoute>}
          />
          <Route
            path="/admin/plans"
            element={<ProtectedRoute requireSuperAdmin><PageTransition><PlansPage /></PageTransition></ProtectedRoute>}
          />

          {/* Settings (Gymloop v2 shell) */}
          <Route
            path="/owner/settings"
            element={<ProtectedRoute allowedRoles={['owner']}><OwnerShell activeTab="settings"><PageTransition><OwnerSettingsHubV2 /></PageTransition></OwnerShell></ProtectedRoute>}
          />
          <Route
            path="/owner/settings/quick-links"
            element={<ProtectedRoute allowedRoles={['owner']}><OwnerShell activeTab="settings"><PageTransition><OwnerQuickLinksV2 /></PageTransition></OwnerShell></ProtectedRoute>}
          />
          <Route
            path="/owner/settings/equipment"
            element={<ProtectedRoute allowedRoles={['owner']}><OwnerShell activeTab="settings"><PageTransition><OwnerEquipmentV2 /></PageTransition></OwnerShell></ProtectedRoute>}
          />
          <Route
            path="/owner/settings/numbering"
            element={<ProtectedRoute allowedRoles={['owner']}><OwnerShell activeTab="settings"><PageTransition><OwnerNumberingSettingsV2 /></PageTransition></OwnerShell></ProtectedRoute>}
          />
          <Route
            path="/owner/settings/card-editor"
            element={<ProtectedRoute allowedRoles={['owner']}><OwnerShell activeTab="settings"><PageTransition><OwnerCardDesignV2 /></PageTransition></OwnerShell></ProtectedRoute>}
          />

          {/* Membership Plans (Gymloop v2 shell) */}
          <Route
            path="/owner/plans"
            element={<ProtectedRoute allowedRoles={['owner']}><OwnerShell activeTab="settings"><PageTransition><OwnerPlansListV2 /></PageTransition></OwnerShell></ProtectedRoute>}
          />
          <Route
            path="/owner/plans/add"
            element={<ProtectedRoute allowedRoles={['owner']}><OwnerShell activeTab="settings"><PageTransition><OwnerAddPlanV2 /></PageTransition></OwnerShell></ProtectedRoute>}
          />
          <Route
            path="/owner/plans/edit/:planId"
            element={<ProtectedRoute allowedRoles={['owner']}><OwnerShell activeTab="settings"><PageTransition><OwnerAddPlanV2 /></PageTransition></OwnerShell></ProtectedRoute>}
          />
        </Routes>
      </AnimatePresence>
    </Suspense>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AnimatedRoutes />
          <PWAInstallPrompt />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
