import type { ComponentType } from "react";

/** The signed-in user, as GET /api/me words it: the Worker decides what their roles allow. */
export interface AuthUser {
  id: string;
  name: string;
  admin: boolean;
  /** May ask now: Admin or Contrib until launch, anyone after it. */
  mayAsk: boolean;
}

/**
 * What the local mode adds to the page (src/local/client.tsx): a picker of test users shown
 * instead of the sign-in redirect, and ways to play a payment.
 */
export interface LocalMode {
  /** Signs a test user in (the Worker sets the session cookie), then calls `onSignedIn`. */
  Picker: ComponentType<{
    onClose: () => void;
    onSignedIn: () => void;
  }>;
  /** Plays the user paying the QR of a run. */
  simulatePayment(runId: string): Promise<void>;
  /** Plays the 15 minutes of the QR passing without a payment. */
  simulateExpiry(runId: string): Promise<void>;
}

export const isAdmin = (user: AuthUser | null) => user?.admin ?? false;
