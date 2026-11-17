import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type Api, createApi } from "../api.ts";
import { loadAuth } from "./load.ts";
import type { Auth, AuthUser } from "./types.ts";

interface Session {
  /** False until the sign-in state is known. */
  ready: boolean;
  user: AuthUser | null;
  api: Api;
  auth: Auth | null;
  /** Starts a sign-in that comes back to `returnTo` (the current page by default). */
  signIn(returnTo?: string): void;
  signOut(): void;
  /** Set when a sign-in failed. */
  failed: boolean;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadAuth()
      .then(async (a) => {
        if (!live) return;
        setAuth(a);
        const u = await a.init().catch(() => {
          setFailed(true);
          return null;
        });
        if (live) setUser(u);
      })
      .catch(() => setFailed(true))
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const api = useMemo(() => createApi(() => (auth ? auth.token() : Promise.resolve(null))), [auth]);

  const signIn = useCallback(
    (returnTo = window.location.pathname) => {
      if (!auth) return;
      setFailed(false);
      if (auth.Picker) setPicking(returnTo);
      else auth.signIn(returnTo).catch(() => setFailed(true));
    },
    [auth],
  );

  const signOut = useCallback(() => {
    auth
      ?.signOut()
      .then(() => setUser(null))
      .catch(() => setFailed(true));
  }, [auth]);

  const value = useMemo(
    () => ({ ready, user, api, auth, signIn, signOut, failed }),
    [ready, user, api, auth, signIn, signOut, failed],
  );
  const Picker = auth?.Picker;
  return (
    <SessionContext.Provider value={value}>
      {children}
      {Picker && picking !== null && (
        <Picker
          returnTo={picking}
          onClose={() => setPicking(null)}
          onSignedIn={(u) => {
            setUser(u);
            setPicking(null);
          }}
        />
      )}
    </SessionContext.Provider>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside SessionProvider");
  return session;
}
