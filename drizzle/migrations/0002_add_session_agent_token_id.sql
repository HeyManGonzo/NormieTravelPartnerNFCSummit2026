-- Additive: per-session selected Normie identity. Defaults to Gemel (#6832) so
-- existing sessions keep working. Applied directly to Supabase (not via
-- drizzle-kit push, to avoid touching the admin-branch columns already live).
ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "agent_token_id" text NOT NULL DEFAULT '6832';
