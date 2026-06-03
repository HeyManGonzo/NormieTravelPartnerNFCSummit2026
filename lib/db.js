import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/drizzle/schema.js';

// On Vercel serverless we want one short-lived connection per invocation
// (Supabase's transaction pooler handles fan-in). Locally, reuse across
// hot-reloads to avoid exhausting connections.
const globalForDb = globalThis;

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local.');
  }
  return postgres(url, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    // Fail fast if a connection can't be established (e.g. the Supabase pooler
    // is briefly saturated on a cold start) instead of hanging until Vercel
    // kills the function with a 504 FUNCTION_INVOCATION_TIMEOUT. Seconds.
    connect_timeout: 10,
  });
}

// Race a DB operation against a deadline so a stalled connection or query
// surfaces as a fast error the route can turn into a 500 — rather than hanging
// until the serverless function times out (504). Default 8s keeps a margin
// under Vercel's function limit.
export async function withTimeout(promise, ms = 8000, label = 'db') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const queryClient = globalForDb.__nfcDb ?? createClient();
if (process.env.NODE_ENV !== 'production') {
  globalForDb.__nfcDb = queryClient;
}

export const db = drizzle(queryClient, { schema });
export { schema };
