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

/** The page of a run: public, readable signed out; by its link once it has one. */
export { runPath } from "@chebot/protocol";

export interface NavItem {
  to: string;
  label: string;
  /** Shown only when this says so (an admin). */
  show?: (user: AuthUser) => boolean;
}

/** The pages of the menu of the signed-in user, in the header; "Salir" comes after them. */
export const accountItems: NavItem[] = [
  { to: "/mis-preguntas", label: t.nav.myRuns },
  // Hidden from others; the page refuses them too, and the API answers them 403.
  { to: "/admin", label: t.nav.admin, show: isAdmin },
];
