import React, { useCallback, useEffect, useState } from 'react';
import type { Role, TrackedBrand, User, Workspace } from '../types';
import { api, setToken, setUnauthorizedHandler } from '../api/client';
import { AuthContext } from './authContextObject';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem('bp_token'));
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(localStorage.getItem('bp_token')));
  const [brands, setBrands] = useState<TrackedBrand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');

  const refreshBrands = useCallback(async () => {
    try {
      const brandList = await api.brands.list();
      setBrands(brandList);
    } catch (err) {
      console.error('Failed to load brands:', err);
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setUser(null);
    setWorkspace(null);
    setRole(null);
    setBrands([]);
    setSelectedBrandId('');
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => {
      setUnauthorizedHandler(null);
    };
  }, [logout]);

  useEffect(() => {
    const savedToken = localStorage.getItem('bp_token');
    if (!savedToken) return;

    const controller = new AbortController();
    let cancelled = false;

    const verifyUser = async () => {
      try {
        const data = await api.auth.me(controller.signal);
        if (cancelled) return;
        setUser(data.user);
        setWorkspace(data.workspace);
        setRole(data.role);
        setTokenState(savedToken);
        await refreshBrands();
      } catch {
        if (cancelled || controller.signal.aborted) return;
        setToken(null);
        setTokenState(null);
        setUser(null);
        setWorkspace(null);
        setRole(null);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void verifyUser();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [refreshBrands]);

  const login = async (email: string, password: string) => {
    const res = await api.auth.login({ email, password });
    setToken(res.token);
    setTokenState(res.token);
    setUser(res.user);
    setWorkspace(res.workspace);
    setRole(res.role);
    await refreshBrands();
  };

  const register = async (email: string, password: string, name: string) => {
    const res = await api.auth.register({ email, password, name });
    setToken(res.token);
    setTokenState(res.token);
    setUser(res.user);
    setWorkspace(res.workspace);
    setRole(res.role);
    await refreshBrands();
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        workspace,
        role,
        isAuthenticated: Boolean(token && user),
        isLoading,
        brands,
        selectedBrandId,
        setSelectedBrandId,
        login,
        register,
        logout,
        refreshBrands,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
