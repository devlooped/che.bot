import { t } from "../i18n/index.ts";
import { Link } from "../router/index.tsx";

export function NotFound() {
  return (
    <main className="page page-narrow">
      <h1 className="page-title">{t.notFound.title}</h1>
      <p>
        <Link to="/">{t.notFound.back}</Link>
      </p>
    </main>
  );
}
