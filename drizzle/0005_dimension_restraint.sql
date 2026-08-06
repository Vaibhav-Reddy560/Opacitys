-- The live "dimension" enum only has 7 values (hierarchy, color, typography,
-- layout, spacing, balance, originality) — rhythm/contrast/depth were added
-- to src/lib/db/schema.ts but never migrated (added out-of-band via
-- `drizzle-kit push` at some point, and even that apparently never landed on
-- this database). Confirmed live: `select 'contrast'::dimension` fails with
-- "invalid input value for enum dimension". IF NOT EXISTS makes this
-- idempotent for any environment, whichever of these it's already missing.
--
-- `restraint` is new, replacing `originality` as a critique dimension (the
-- standalone Originality studio feature is a separate concept and keeps its
-- name). Postgres cannot DROP VALUE from an enum, so `originality` and
-- `depth` are deliberately left in place, orphaned — see the comment on
-- dimensionEnum in src/lib/db/schema.ts.
--
-- LANDMINE for whoever adds the next migration: this file's meta/_journal.json
-- entry (idx 5) was hand-written with "when": 1786007730000, which turned out
-- to be AHEAD of the real system clock at the time (confirmed: Date.now() ran
-- ~23h behind it while building migration 0006). drizzle-orm's pg migrator
-- only applies a migration when `lastDbMigration.created_at < migration.when`
-- (node_modules/drizzle-orm/pg-core/dialect.cjs) — since that DB row's
-- created_at is permanently 1786007730000, any migration generated with a
-- real, lower Date.now() gets silently skipped: `drizzle-kit migrate` prints
-- "migrations applied successfully" and does nothing. Confirmed live: 0006
-- silently no-opped until its journal "when" was hand-bumped past this value.
-- Before trusting a future `db:generate`, diff the new journal entry's "when"
-- against 1786007730000 (or the current max, if it's climbed since) and bump
-- it if the real clock hasn't caught up yet.
ALTER TYPE "public"."dimension" ADD VALUE IF NOT EXISTS 'rhythm';--> statement-breakpoint
ALTER TYPE "public"."dimension" ADD VALUE IF NOT EXISTS 'contrast';--> statement-breakpoint
ALTER TYPE "public"."dimension" ADD VALUE IF NOT EXISTS 'depth';--> statement-breakpoint
ALTER TYPE "public"."dimension" ADD VALUE IF NOT EXISTS 'restraint';
