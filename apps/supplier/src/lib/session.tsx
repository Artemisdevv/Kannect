import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { readSession, setUnauthorizedHandler, writeSession } from "./api/client";
import type { Session } from "./api/types";

interface Ctx {
  ready: boolean;
  session: Session | null;
  signIn: (s: Session) => void;
  signOut: () => void;
}

const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const s = readSession();
    setSession(s && s.role === "supplier" ? s : null);
    setReady(true);
  }, []);

  const signOut = useCallback(() => {
    writeSession(null);
    setSession(null);
  }, []);

  useEffect(() => setUnauthorizedHandler(signOut), [signOut]);

  const signIn = useCallback((s: Session) => {
    writeSession(s);
    setSession(s);
  }, []);

  return (
    <SessionCtx.Provider value={{ ready, session, signIn, signOut }}>{children}</SessionCtx.Provider>
  );
}

export function useSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error("useSession outside provider");
  return c;
}
