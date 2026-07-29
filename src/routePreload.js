// Shared import factories for routes that need to be prefetched ahead of
// when their component actually mounts — e.g. behind a ProtectedRoute that
// blocks rendering until auth resolves. Calling the same factory App.jsx
// passes to lazy() is safe to repeat; the browser/bundler dedupes the
// underlying chunk request.
export const importOwnerDashboard = () => import('./pages/OwnerDashboard/OwnerDashboard');
