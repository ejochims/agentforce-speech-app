/**
 * localStorage wrapper that silently swallows SecurityError.
 * Safari in private browsing mode throws when any localStorage method is
 * called — without this guard the entire app crashes on first load.
 */
export const safeStorage = {
  getItem(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  setItem(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
  },
  removeItem(key: string): void {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};
