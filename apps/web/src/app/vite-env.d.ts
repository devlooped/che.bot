/// <reference types="vite/client" />

// The public build variables of sign-in (see .env.example). Public: they end up in the bundle.
interface ImportMetaEnv {
  readonly VITE_AUTH0_DOMAIN?: string;
  readonly VITE_AUTH0_CLIENT_ID?: string;
  readonly VITE_AUTH0_AUDIENCE?: string;
}
