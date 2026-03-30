import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../services/api.js';
import { STORAGE_KEYS, clearLegacyAuthKeys } from '../constants/storageKeys.js';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.user);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  // Verify token on mount + listen for forced logout events
  useEffect(() => {
    // Remove non-namespaced keys to avoid cross-app token bleed on localhost.
    clearLegacyAuthKeys();

    const verifyToken = async () => {
      const token = localStorage.getItem(STORAGE_KEYS.accessToken);
      if (!token) { setLoading(false); return; }

      try {
        const { data } = await api.get('/auth/me');
        setUser(data.user);
        localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(data.user));
      } catch {
        clearSession();
      } finally {
        setLoading(false);
      }
    };

    verifyToken();

    const handleForcedLogout = () => { clearSession(); };
    window.addEventListener('auth:logout', handleForcedLogout);
    return () => window.removeEventListener('auth:logout', handleForcedLogout);
  }, []);

  const clearSession = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEYS.accessToken);
    localStorage.removeItem(STORAGE_KEYS.refreshToken);
    localStorage.removeItem(STORAGE_KEYS.user);
  };

  const login = useCallback((userData, accessToken, refreshToken) => {
    setUser(userData);
    localStorage.setItem(STORAGE_KEYS.accessToken, accessToken);
    localStorage.setItem(STORAGE_KEYS.refreshToken, refreshToken);
    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(userData));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch { /* ignore */ }
    clearSession();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
