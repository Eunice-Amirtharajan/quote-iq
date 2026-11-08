import { createContext } from 'react';

export type Role = "SALES_REP" | "SALES_MANAGER";

export interface User {
  id:    string;
  name:  string;
  email: string;
  role:  Role;
}

export interface AuthContextType {
  user:    User | null;
  setUser: (user: User | null) => void;
}

// No default: a component outside AuthProvider must fail loudly (see useAuth), not look logged out
export const AuthContext = createContext<AuthContextType | null>(null);
