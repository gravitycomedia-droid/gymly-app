import { createContext, useContext } from 'react';

// Cross-cutting shell affordances (toast, quick-view drawer, global search) that
// nested owner screens need to trigger without prop-drilling through OwnerShell.
export const OwnerShellContext = createContext({
  toast: () => {},
  openQuickView: () => {},
  closeQuickView: () => {},
  openSearch: () => {},
});

export const useOwnerShell = () => useContext(OwnerShellContext);
