-- Hand-written, not drizzle-kit generated: the schema diff (drop
-- password_hash, add firebase_uid/name/image) triggers drizzle-kit's
-- interactive rename-vs-drop-and-add prompt, which requires a TTY this
-- environment doesn't have. The SQL below and the accompanying
-- meta/0007_snapshot.json + _journal.json entry were constructed by hand to
-- match exactly what `drizzle-kit generate` would have produced by
-- answering "no, these are unrelated columns" to every prompt.
ALTER TABLE "users" DROP COLUMN "password_hash";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "firebase_uid" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_firebase_uid_unique" UNIQUE("firebase_uid");
