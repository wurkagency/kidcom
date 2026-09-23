/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin. Unset in dev: requests go to /api, proxied to the API by Vite. */
  readonly VITE_API_BASE?: string;
}
