import { Settings as SettingsIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";
import { PrismPanel, PrismIcon, PrismRule } from "@/components/brand/prism";
import { META_ACCENT } from "@/lib/critique/spectrum";
import { DeleteAccountControl } from "@/components/studio/delete-account-control";

const ACCENT = META_ACCENT;

/**
 * What actually belongs on a settings page for THIS app, not a generic
 * settings-page template: there's no password (Google-only auth — nothing to
 * change), no plans or billing, and no notification system yet. What's
 * genuinely real and missing is account identity (who you're signed in as)
 * and account deletion — every other "settings" a user might expect here is
 * either a module of its own already (Fingerprint holds style preferences,
 * Library holds and manages the actual data) or doesn't exist as a feature
 * yet, and this page shouldn't pretend otherwise with dead toggles.
 */
export default async function SettingsPage() {
  const session = await readSession();
  if (!session) redirect("/login");

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-10">
          <div className="flex items-start gap-4">
            <PrismIcon accent={ACCENT} size={46}>
              <SettingsIcon className="size-4" aria-hidden />
            </PrismIcon>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl tracking-tight" style={{ fontVariationSettings: '"wght" 550' }}>
                Settings
              </h1>
              <p className="mt-1 text-[14px] text-foreground/58">Your account, and the account itself.</p>
            </div>
          </div>
          <div className="mt-6">
            <PrismRule />
          </div>
        </header>

        <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">Account</h2>
          <div className="mt-4 flex items-center gap-3.5">
            {session.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- external Google avatar URL, not in next.config's image domains
              <img src={session.image} alt="" className="size-12 shrink-0 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/[0.08] text-[16px] text-foreground/75">
                {(session.name ?? session.email)[0]?.toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              {session.name && <p className="truncate text-[15px] text-foreground/90">{session.name}</p>}
              <p className="truncate text-[13px] text-foreground/55">{session.email}</p>
            </div>
          </div>
          <p className="mt-4 text-[12.5px] leading-relaxed text-foreground/48">
            Signed in with Google. Your name and photo come from your Google account and update automatically the
            next time you sign in — there’s nothing to edit here directly.
          </p>
        </PrismPanel>

        <PrismPanel accent={ACCENT} className="mt-6 p-6 sm:p-7">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">Danger zone</h2>
          <p className="mt-3 text-[13px] leading-relaxed text-foreground/62">
            Permanently delete your account — every upload, analysis, and saved result across every feature. This
            cannot be undone.
          </p>
          <div className="mt-4">
            <DeleteAccountControl email={session.email} />
          </div>
        </PrismPanel>
      </div>
    </div>
  );
}
