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
  });
}

const queryClient = globalForDb.__nfcDb ?? createClient();
if (process.env.NODE_ENV !== 'production') {
  globalForDb.__nfcDb = queryClient;
}

export const db = drizzle(queryClient, { schema });
export { schema };
