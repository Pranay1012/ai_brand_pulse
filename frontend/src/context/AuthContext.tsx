import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Role, TrackedBrand, User, Workspace } from '../types';
import { api, setToken } from '../api/client';

interface AuthContextType {
  token: string | null;
  user: User | null;
  workspace: Workspace | null;
  role: Role | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  brands: TrackedBrand[];
  selectedBrandId: string;
  setSelectedBrandId: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  refreshBrands: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem('bp_token'));
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
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

  const verifyUser = useCallback(async () => {
    const savedToken = localStorage.getItem('bp_token');
    if (!savedToken) {
      setIsLoading(false);
      return;
    }

    try {
      const data = await api.auth.me();
      setUser(data.user);
      setWorkspace(data.workspace);
      setRole(data.role);
      setTokenState(savedToken);
      await refreshBrands();
    } catch {
      setToken(null);
      setTokenState(null);
      setUser(null);
      setWorkspace(null);
      setRole(null);
    } finally {
      setIsLoading(false);
    }
  }, [refreshBrands]);

  useEffect(() => {
    verifyUser();
  }, [verifyUser]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.auth.login({ email, password });
      setToken(res.token);
      setTokenState(res.token);
      setUser(res.user);
      setWorkspace(res.workspace);
      setRole(res.role);
      await refreshBrands();
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, name: string) => {
    setIsLoading(true);
    try {
      const res = await api.auth.register({ email, password, name });
      setToken(res.token);
      setTokenState(res.token);
      setUser(res.user);
      setWorkspace(res.workspace);
      setRole(res.role);
      await refreshBrands();
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setTokenState(null);
    setUser(null);
    setWorkspace(null);
    setRole(null);
    setBrands([]);
    setSelectedBrandId('');
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        workspace,
        role,
        isAuthenticated: !!token && !!user,
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

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

