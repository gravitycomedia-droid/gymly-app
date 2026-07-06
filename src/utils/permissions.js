export const ROLE_PERMISSIONS = {
  owner: [
    'all',
    'add_member', 'edit_member', 'delete_member', 'view_members',
    'renew_membership', 'add_staff', 'view_staff', 'edit_staff',
    'delete_staff', 'view_analytics', 'view_payments', 'mark_attendance',
    'edit_numbering', 'view_numbering',
  ],
  manager: [
    'add_member', 'edit_member', 'delete_member', 'view_members',
    'renew_membership', 'view_analytics', 'view_payments', 'mark_attendance',
    'view_numbering',
  ],
  trainer: [
    'view_assigned_members', 'assign_workout',
  ],
  receptionist: [
    'add_member', 'edit_member', 'view_members', 'mark_attendance',
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
  if (!userDoc) return false;
  const stored = userDoc.permissions || [];
  if (stored.includes('all')) return true;
  if (stored.includes(action)) return true;
  // Fall back to role defaults so permission-model changes apply to staff docs
  // that were created before the change, without needing a data migration.
  const roleDefaults = ROLE_PERMISSIONS[userDoc.role] || [];
  if (roleDefaults.includes('all')) return true;
  return roleDefaults.includes(action);
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
    case 'receptionist': return '/receptionist';
    case 'member': return '/member/home';
    default: return '/select-role';
  }
}

/**
 * Get the URL base path for member/add/edit/profile routes for a given role.
 * Shared member pages (list, add, edit, profile) use this so staff stay
 * inside their own route namespace instead of hitting owner-only routes.
 */
export function getBasePath(role) {
  switch (role) {
    case 'manager': return '/manager';
    case 'receptionist': return '/receptionist';
    case 'trainer': return '/trainer';
    default: return '/owner';
  }
}
