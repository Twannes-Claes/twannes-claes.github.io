/**
 * Where the Convex backend lives. Not secret: every call is checked on the server, see
 * convex/access.ts. `npx convex dev` puts the development deployment's address in .env.local,
 * which only this machine has; the built site falls back to production, pasted here from the
 * Convex dashboard, see README.md.
 */
export const convexUrl: string = import.meta.env.VITE_CONVEX_URL || '';
