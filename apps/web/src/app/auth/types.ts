import type { ComponentType } from "react";

export interface AuthUser {
  id: string;
  name: string;
  roles: string[];
}

/** Sign-in, as the pages see it: Auth0 in production, a picker of test users in the local mode. */
export interface Auth {
  /** Finishes a sign-in redirect if the page is one, and returns who is signed in. */
  init(): Promise<AuthUser | null>;
  signIn(returnTo: string): Promise<void>;
  signOut(): Promise<void>;
  /** The access token for the API, or null when signed out. */
  token(): Promise<string | null>;
  /** The local mode: a dialog that signs in without Auth0, shown instead of a redirect. */
  Picker?: ComponentType<{
    returnTo: string;
    onClose: () => void;
    onSignedIn: (user: AuthUser) => void;
  }>;
  /** The local mode: plays the user paying the QR of a run. */
  simulatePayment?(runId: string): Promise<void>;
  /** The local mode: plays the 15 minutes of the QR passing without a payment. */
  simulateExpiry?(runId: string): Promise<void>;
}

/** The roles of a token's claims, as the Worker reads them (src/worker/auth0.ts). */
export function rolesOf(claims: Record<string, unknown>): string[] {
  const roles = new Set<string>();
  for (const [key, value] of Object.entries(claims)) {
    if (!/^(?:.*[/:.])?roles?$/i.test(key)) continue;
    const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    for (const role of values) if (typeof role === "string") roles.add(role);
  }
  return [...roles];
}

/** The claims of a JWT, unverified: only to show the right buttons; the Worker checks the token. */
export function claimsOf(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1] ?? "";
    const bytes = Uint8Array.from(atob(part.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
      c.charCodeAt(0),
    );
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export const isAdmin = (user: AuthUser | null) => user?.roles.includes("admin") ?? false;
