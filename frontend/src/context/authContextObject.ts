import { createContext } from 'react';
import type { Role, TrackedBrand, User, Workspace } from '../types';

export interface AuthContextType {
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

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
