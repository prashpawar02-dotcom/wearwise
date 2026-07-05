import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { Icon } from "@/components/ui/Icon";
import { FeedbackForm } from "./feedback-form";

export const dynamic = "force-dynamic";

const VALID_CONTEXTS = ["today", "wardrobe", "style_me", "daily_drop", "profile", "admin", "other"];

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: { from?: string };
}) {
  // Requires a signed-in user (redirects to /login otherwise).
  await requireProfile();

  const from = (searchParams?.from ?? "").toLowerCase();
  const initialContext = VALID_CONTEXTS.includes(from) ? from : "profile";

  return (
    <main className="min-h-dvh px-6 pb-16 pt-8">
      <div className="animate-fade-in">
        <Link
          href="/profile"
          className="inline-flex min-h-[36px] items-center gap-1.5 text-sm text-graphite hover:text-charcoal"
        >
          <Icon.ArrowLeft className="h-4 w-4" /> Back to Profile
        </Link>

        <div className="mt-4">
          <p className="ww-eyebrow text-plum">Private beta</p>
          <h1 className="ww-display mt-1 text-2xl text-charcoal">Give feedback</h1>
          <p className="mt-1.5 text-sm text-graphite">
            Tell us what felt confusing, broken, or useful. Every note helps.
          </p>
        </div>

        <div className="mt-6">
          <FeedbackForm initialContext={initialContext} />
        </div>
      </div>
    </main>
  );
}
