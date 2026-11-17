import { SessionProvider } from "./auth/context.tsx";
import { Header } from "./components/Header.tsx";
import { NotFound } from "./pages/NotFound.tsx";
import { match, usePath } from "./router/index.tsx";
import { routes } from "./routes.tsx";

function Page() {
  const path = usePath();
  for (const route of routes) {
    const params = match(route.pattern, path);
    if (params) return <route.page params={params} />;
  }
  return <NotFound />;
}

export function App() {
  return (
    <SessionProvider>
      <Header />
      <Page />
    </SessionProvider>
  );
}
