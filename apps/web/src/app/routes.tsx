import type { ComponentType } from "react";
import type { AuthUser } from "./auth/types.ts";
import { t } from "./i18n/index.ts";
import { AskPage } from "./pages/AskPage.tsx";
import { RunPage } from "./pages/RunPage.tsx";

// The pages of the app, by path. Steps 32 to 35 add theirs here and in `navItems`:
//   "/mis-preguntas"  the user's questions (step 33), signed in
//   "/admin"          the models and the prices (step 34), shown to admins (isAdmin)
// The history slider (step 32) lives on the run page.

export interface Route {
  pattern: string;
  page: ComponentType<{ params: Record<string, string> }>;
}

export const routes: Route[] = [
  { pattern: "/", page: AskPage },
  { pattern: "/r/:id", page: RunPage },
];

/** The link of a run: public, readable signed out. */
export const runPath = (id: string) => `/r/${id}`;

export interface NavItem {
  to: string;
  label: string;
  /** Shown only when this says so (a signed-in user, an admin). */
  show?: (user: AuthUser | null) => boolean;
}

export const navItems: NavItem[] = [{ to: "/", label: t.nav.ask }];
