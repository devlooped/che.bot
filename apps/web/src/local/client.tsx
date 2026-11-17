// The browser side of the local mode, loaded only by a build in `--mode fakes` (see
// src/app/auth/load.ts): a sign-in that picks a test user instead of going to Auth0, and a way to
// play the payment of a QR. Never part of a production bundle (scripts/check-build.mjs).
import { useEffect, useRef } from "react";
import type { Auth, AuthUser } from "../app/auth/types.ts";
import { t } from "../app/i18n/index.ts";
import { LOCAL_MODE_MARKER } from "./marker.ts";
import { localToken } from "./token.ts";

const KEY = `${LOCAL_MODE_MARKER}:user`;

/** The test users of the local mode. */
export const LOCAL_USERS: (AuthUser & { label: keyof typeof t.local.users })[] = [
  { id: "local|ana", name: "Ana", roles: ["beta"], label: "beta" },
  { id: "local|admin", name: "Admin", roles: ["admin"], label: "admin" },
  { id: "local|juan", name: "Juan", roles: [], label: "outsider" },
];

function stored(): AuthUser | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function Picker({
  onClose,
  onSignedIn,
}: {
  returnTo: string;
  onClose: () => void;
  onSignedIn: (user: AuthUser) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet local-picker"
      onClose={onClose}
      aria-labelledby="local-title"
    >
      <div className="sheet-body">
        <p className="local-badge">{t.local.badge}</p>
        <h2 id="local-title" className="sheet-title">
          {t.local.title}
        </h2>
        <p className="muted">{t.local.lede}</p>
        <ul className="local-users">
          {LOCAL_USERS.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="button button-quiet"
                onClick={() => {
                  const user = { id: u.id, name: u.name, roles: u.roles };
                  localStorage.setItem(KEY, JSON.stringify(user));
                  onSignedIn(user);
                }}
              >
                {t.local.users[u.label]}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="button button-text" onClick={() => ref.current?.close()}>
          {t.common.close}
        </button>
      </div>
    </dialog>
  );
}

export function createLocalAuth(): Auth {
  return {
    init: async () => stored(),
    signIn: async () => {},
    signOut: async () => {
      localStorage.removeItem(KEY);
    },
    token: async () => {
      const user = stored();
      return user ? localToken({ sub: user.id, roles: user.roles }) : null;
    },
    Picker,
    simulatePayment: async (runId) => {
      await fetch(`/api/local/pay/${runId}`, { method: "POST" });
    },
  };
}
