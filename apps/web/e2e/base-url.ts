/** Where the end-to-end tests reach the local mode (playwright.config.ts starts it there). */
export const PORT = Number(process.env.E2E_PORT ?? 5198);
export const BASE_URL = `http://localhost:${PORT}`;
