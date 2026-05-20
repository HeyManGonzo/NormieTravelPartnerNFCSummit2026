import { config } from 'dotenv';

// Next.js loads .env.local automatically, but drizzle-kit runs outside Next,
// so we point dotenv at .env.local explicitly (with .env as fallback).
config({ path: '.env.local' });
config({ path: '.env' });

/** @type {import('drizzle-kit').Config} */
export default {
  schema: './drizzle/schema.js',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
};
