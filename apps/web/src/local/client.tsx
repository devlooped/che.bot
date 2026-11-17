// The browser side of the local mode, loaded only by a build in `--mode fakes` (see
// src/app/auth/load.ts): a sign-in that picks a test user instead of going to Auth0 (the local
// Worker sets the same session cookie as the real sign-in), and a way to play the payment of a QR.
// Never part of a production bundle (scripts/check-build.mjs).
import { useEffect, useRef, useState } from "react";
import type { LocalMode } from "../app/auth/types.ts";
import { t } from "../app/i18n/index.ts";
import { LOCAL_MODE_MARKER } from "./marker.ts";

/** A test user of the local mode: who signs in, with the roles of the tenant. */
export interface LocalUser {
  id: string;
  name: string;
  roles: string[];
}

/** The test users of the picker. */
export const LOCAL_USERS: (LocalUser & { label: keyof typeof t.local.users })[] = [
  { id: "local|ana", name: "Ana", roles: ["Contrib"], label: "contrib" },
  { id: "local|admin", name: "Admin", roles: ["Admin"], label: "admin" },
  { id: "local|juan", name: "Juan", roles: [], label: "outsider" },
];

/**
 * Signs `user` in: the local Worker answers with a session cookie. The marker it sends keeps
 * LOCAL_MODE_MARKER in this module, so that the build check finds it if it ever leaks.
 */
export async function signInLocally(user: LocalUser): Promise<void> {
  const response = await fetch("/api/local/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json", "x-local-mode": LOCAL_MODE_MARKER },
    body: JSON.stringify(user),
  });
  if (!response.ok) throw new Error(`The local sign-in answered ${response.status}.`);
}

function Picker({ onClose, onSignedIn }: { onClose: () => void; onSignedIn: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [failed, setFailed] = useState(false);
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
        {failed && (
          <p className="error" role="alert">
            {t.errors.signInFailed}
          </p>
        )}
        <ul className="local-users">
          {LOCAL_USERS.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="button button-quiet"
                onClick={() => {
                  setFailed(false);
                  signInLocally({ id: u.id, name: u.name, roles: u.roles })
                    .then(onSignedIn)
                    .catch(() => setFailed(true));
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

export function createLocalMode(): LocalMode {
  return {
    Picker,
    simulatePayment: async (runId) => {
      await fetch(`/api/local/pay/${runId}`, { method: "POST" });
    },
    simulateExpiry: async (runId) => {
      await fetch(`/api/local/expire/${runId}`, { method: "POST" });
    },
  };
}
