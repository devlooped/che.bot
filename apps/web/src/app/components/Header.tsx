import { useEffect, useId, useRef, useState } from "react";
import { useSession } from "../auth/context.tsx";
import type { AuthUser } from "../auth/types.ts";
import { t } from "../i18n/index.ts";
import { Link, usePath } from "../router/index.tsx";
import { accountItems } from "../routes.tsx";
import { setTheme, useTheme } from "../theme.ts";
import { HomeIcon, MoonIcon, PlusIcon, ProfileIcon, SunIcon } from "./Icons.tsx";

/** The switch between the light page (the default) and the dark one: pressed when dark. */
function ThemeSwitch() {
  const dark = useTheme() === "dark";
  return (
    <button
      type="button"
      className="round-button"
      aria-label={t.nav.darkTheme}
      title={t.nav.darkTheme}
      aria-pressed={dark}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/**
 * The profile button of a signed-in user and its menu: their pages and "Salir". It closes with
 * Escape (the focus back on the button), a click outside, or a move to another page.
 */
function AccountMenu({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const path = usePath();
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new page closes the menu
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="account" ref={root}>
      <button
        ref={button}
        type="button"
        className="round-button"
        aria-label={t.nav.account}
        title={t.nav.signedInAs(user.name)}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
      >
        <ProfileIcon />
      </button>
      <div id={menuId} className="account-menu" hidden={!open}>
        <p className="account-name">{t.nav.signedInAs(user.name)}</p>
        <nav aria-label={t.nav.menu}>
          <ul>
            {accountItems
              .filter((item) => !item.show || item.show(user))
              .map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="account-item"
                    aria-current={path === item.to ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
        <button type="button" className="account-item" onClick={onSignOut}>
          {t.nav.signOut}
        </button>
      </div>
    </div>
  );
}

/**
 * The header of every page, in one row: the round home button, the name in the middle, then the
 * round buttons of the theme, to ask (to sign in first, for someone signed out) and of the
 * account; a double rule under it.
 */
export function Header() {
  const { ready, user, local, signIn, signOut } = useSession();
  return (
    <header className="site-header">
      <div className="header-bar">
        <div className="header-start">
          <Link to="/" className="round-button" aria-label={t.nav.home} title={t.nav.home}>
            <HomeIcon />
          </Link>
          {local && <span className="local-tag">{t.local.badge}</span>}
        </div>
        <Link to="/" className="wordmark">
          {t.appName}
        </Link>
        <div className="header-end">
          <ThemeSwitch />
          <Link
            to="/"
            className="round-button"
            aria-label={t.nav.ask}
            title={t.nav.ask}
            onClick={(e) => {
              // Asking needs a session: someone signed out signs in first, and comes back to ask.
              if (!ready || user) return;
              e.preventDefault();
              signIn("/");
            }}
          >
            <PlusIcon />
          </Link>
          {ready &&
            (user ? (
              <AccountMenu user={user} onSignOut={signOut} />
            ) : (
              <button
                type="button"
                className="round-button"
                aria-label={t.nav.signIn}
                title={t.nav.signIn}
                onClick={() => signIn()}
              >
                <ProfileIcon />
              </button>
            ))}
        </div>
      </div>
      <div className="rule-double" />
    </header>
  );
}
