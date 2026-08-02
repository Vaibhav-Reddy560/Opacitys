import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Lazily initialized: Next's production build imports every route module
// (including ones that never touch the DB) while "collecting page data",
// so throwing here at module-evaluation time would fail `next build`
// whenever DATABASE_URL isn't set -- not just at request time for routes
// that actually query. The Proxy defers both the env check and the
// connection pool creation until the first real usage (`db.select(...)`,
// etc.), while `db` itself is still a stable module-scope singleton.
let instance: PostgresJsDatabase<typeof schema> | null = null;

function getInstance(): PostgresJsDatabase<typeof schema> {
  if (instance) return instance;
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local (Neon connection string).",
    );
  }
  // One shared connection pool per server instance. Fluid Compute reuses
  // instances across requests, so this is not re-created per request.
  const client = postgres(process.env.DATABASE_URL, { prepare: false });
  instance = drizzle(client, { schema });
  return instance;
}

export const db: PostgresJsDatabase<typeof schema> = new Proxy(
  {} as PostgresJsDatabase<typeof schema>,
  {
    get(_target, prop, receiver) {
      return Reflect.get(getInstance(), prop, receiver);
    },
  },
);

export { schema };
