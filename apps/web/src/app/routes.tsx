import type { ComponentType } from "react";
import { type AuthUser, isAdmin } from "./auth/types.ts";
import { t } from "./i18n/index.ts";
import { AdminPage } from "./pages/AdminPage.tsx";
import { AskPage } from "./pages/AskPage.tsx";
import { MyRunsPage } from "./pages/MyRunsPage.tsx";
import { RunPage } from "./pages/RunPage.tsx";

// The pages of the app, by path. The history slider of the text lives on the run page.

export interface Route {
  pattern: string;
  page: ComponentType<{ params: Record<string, string> }>;
}

export const routes: Route[] = [
  { pattern: "/", page: AskPage },
  { pattern: "/r/:id", page: RunPage },
  { pattern: "/mis-preguntas", page: MyRunsPage },
  { pattern: "/admin", page: AdminPage },
];

/** The link of a run: public, readable signed out. */
export const runPath = (id: string) => `/r/${id}`;

export interface NavItem {
  to: string;
  label: string;
  /** Shown only when this says so (a signed-in user, an admin). */
  show?: (user: AuthUser | null) => boolean;
}

export const navItems: NavItem[] = [
  { to: "/", label: t.nav.ask },
  { to: "/mis-preguntas", label: t.nav.myRuns, show: (user) => user !== null },
  // Hidden from others; the page refuses them too, and the API answers them 403.
  { to: "/admin", label: t.nav.admin, show: isAdmin },
];
