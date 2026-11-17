import { useSession } from "../auth/context.tsx";
import { t } from "../i18n/index.ts";
import { Link, usePath } from "../router/index.tsx";
import { navItems } from "../routes.tsx";

export function Header() {
  const { ready, user, auth, signIn, signOut } = useSession();
  const path = usePath();
  const items = navItems.filter((item) => !item.show || item.show(user));
  return (
    <header className="site-header">
      <Link to="/" className="wordmark" aria-label={t.nav.home}>
        {t.appName}
      </Link>
      {auth?.Picker && <span className="local-tag">{t.local.badge}</span>}
      <nav className="site-nav" aria-label={t.nav.menu}>
        <ul>
          {items.map((item) => (
            <li key={item.to}>
              <Link to={item.to} aria-current={path === item.to ? "page" : undefined}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        {ready &&
          (user ? (
            <span className="who">
              <span className="who-name" title={t.nav.signedInAs(user.name)}>
                {user.name}
              </span>
              <button type="button" className="button button-text" onClick={signOut}>
                {t.nav.signOut}
              </button>
            </span>
          ) : (
            <button type="button" className="button button-text" onClick={() => signIn()}>
              {t.nav.signIn}
            </button>
          ))}
      </nav>
    </header>
  );
}
