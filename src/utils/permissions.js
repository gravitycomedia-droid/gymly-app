export const ROLE_PERMISSIONS = {
  owner: [
    'all',
    'add_member', 'edit_member', 'delete_member', 'view_members',
    'renew_membership', 'add_staff', 'view_staff', 'edit_staff',
    'delete_staff', 'view_analytics', 'view_payments', 'mark_attendance',
  ],
  manager: [
    'add_member', 'edit_member', 'delete_member', 'view_members',
    'renew_membership', 'view_analytics', 'view_payments', 'mark_attendance',
  ],
  trainer: [
    'view_assigned_members', 'assign_workout',
  ],
  receptionist: [
    'add_member', 'view_members', 'mark_attendance',
  ],
  member: [
    'view_own_profile', 'view_own_workout',
  ],
};

/**
 * Check if a user has a specific permission.
 * Owner with 'all' permission bypasses all checks.
 */
export function can(userDoc, action) {
  if (!userDoc || !userDoc.permissions) return false;
  if (userDoc.permissions.includes('all')) return true;
  return userDoc.permissions.includes(action);
}

/**
 * Check if user has one of the specified roles.
 */
export function hasRole(userDoc, ...roles) {
  if (!userDoc || !userDoc.role) return false;
  return roles.includes(userDoc.role);
}

/**
 * Get the home route for a given role.
 */
export function getHomeRoute(role) {
  switch (role) {
    case 'owner': return '/owner/dashboard';
    case 'manager': return '/manager/members';
    case 'trainer': return '/trainer/members';
    case 'receptionist': return '/receptionist/members';
    case 'member': return '/member/home';
    default: return '/select-role';
  }
}
