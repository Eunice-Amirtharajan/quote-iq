import { createContext } from 'react';

export type Role = "SALES_REP" | "SALES_MANAGER";

export interface User {
  id:    string;
  name:  string;
  email: string;
  role:  Role;
}

interface AuthContextType {
  user:    User | null;
  setUser: (user: User | null) => void;
}

export const AuthContext = createContext<AuthContextType>({
  user:    null,
  setUser: () => {},
});
