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
import { loadLocalMode } from "./load.ts";
import type { AuthUser, LocalMode } from "./types.ts";

// Sign-in happens in the Worker (src/worker/auth0.ts): "Entrar" goes to /auth/login and comes back
// with a session cookie, "Salir" goes to /auth/logout, and the page learns who is signed in from
// GET /api/me. The local mode signs in through its picker instead.

interface Session {
  /** False until the sign-in state is known. */
  ready: boolean;
  user: AuthUser | null;
  api: Api;
  /** The local mode's additions; null in production. */
  local: LocalMode | null;
  /** Starts a sign-in that comes back to `returnTo` (the current page by default). */
  signIn(returnTo?: string): void;
  signOut(): void;
  /** Set when a sign-in failed. */
  failed: boolean;
}

const SessionContext = createContext<Session | null>(null);

/** Whether the Worker sent the page back from a failed sign-in (`?signin=failed`); drops the flag. */
function takeFailedSignIn(): boolean {
  const url = new URL(window.location.href);
  if (url.searchParams.get("signin") !== "failed") return false;
  url.searchParams.delete("signin");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const api = useMemo(() => createApi(), []);
  const [local, setLocal] = useState<LocalMode | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [picking, setPicking] = useState(false);

  const refresh = useCallback(
    () =>
      api
        .me()
        .then(setUser)
        .catch(() => setUser(null)),
    [api],
  );

  useEffect(() => {
    if (takeFailedSignIn()) setFailed(true);
  }, []);

  useEffect(() => {
    let live = true;
    Promise.all([loadLocalMode().then((l) => live && setLocal(() => l)), refresh()]).finally(
      () => live && setReady(true),
    );
    return () => {
      live = false;
    };
  }, [refresh]);

  const signIn = useCallback(
    (returnTo = `${window.location.pathname}${window.location.search}`) => {
      setFailed(false);
      if (local) setPicking(true);
      else window.location.assign(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
    },
    [local],
  );

  const signOut = useCallback(() => window.location.assign("/auth/logout"), []);

  const value = useMemo(
    () => ({ ready, user, api, local, signIn, signOut, failed }),
    [ready, user, api, local, signIn, signOut, failed],
  );
  const Picker = local?.Picker;
  return (
    <SessionContext.Provider value={value}>
      {children}
      {Picker && picking && (
        <Picker
          onClose={() => setPicking(false)}
          onSignedIn={() => {
            setPicking(false);
            refresh();
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
