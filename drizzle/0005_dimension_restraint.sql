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
ALTER TYPE "public"."dimension" ADD VALUE IF NOT EXISTS 'rhythm';--> statement-breakpoint
ALTER TYPE "public"."dimension" ADD VALUE IF NOT EXISTS 'contrast';--> statement-breakpoint
ALTER TYPE "public"."dimension" ADD VALUE IF NOT EXISTS 'depth';--> statement-breakpoint
ALTER TYPE "public"."dimension" ADD VALUE IF NOT EXISTS 'restraint';
