import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { ChildSummary, PublicUser } from "@kidcom/shared";

import { apiGet } from "./api";

type AuthState = {
  user: PublicUser | null;
  children: ChildSummary[];
  loading: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children: providerChildren }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [childList, setChildList] = useState<ChildSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const me = await apiGet<{ user: PublicUser | null }>("/auth/me");
      setUser(me.user);
      if (me.user) {
        const res = await apiGet<{ children: ChildSummary[] }>("/children");
        setChildList(res.children);
      } else {
        setChildList([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, children: childList, loading, refresh }}>
      {providerChildren}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
