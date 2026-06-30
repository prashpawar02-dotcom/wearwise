import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/wearwise/Logo";
import { OutfitStack } from "@/components/wearwise/OutfitStack";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { Icon } from "@/components/ui/Icon";

const STEPS = [
  {
    n: "01",
    title: "Add your real wardrobe",
    body: "Start with 5–10 everyday items. WearWise gets useful fast — no need to upload everything in your closet.",
    icon: <Icon.Hanger className="h-5 w-5 text-plum" />,
    tint: "bg-plum/[0.08]",
  },
  {
    n: "02",
    title: "Tell WearWise your day",
    body: "Work, college, date, travel, dinner, event or casual — one tap sets the context for the recommendation.",
    icon: <Icon.Calendar className="h-5 w-5 text-cobalt" />,
    tint: "bg-cobalt/[0.08]",
  },
  {
    n: "03",
    title: "Get one clear outfit",
    body: "One best pick with simple, editorial reasoning. Swap an item if you want — or wear it as suggested.",
    icon: <Icon.Sparkle className="h-5 w-5 text-champagne" />,
    tint: "bg-champagne/[0.10]",
  },
];

const TRUST = [
  { title: "Private by default", body: "Your wardrobe is yours alone. No public profile, ever.", icon: <Icon.Lock className="h-[18px] w-[18px] text-plum" /> },
  { title: "No social pressure", body: "No comments, likes or comparisons. Just you and your closet.", icon: <Icon.User className="h-[18px] w-[18px] text-plum" /> },
  { title: "Delete anytime", body: "Remove an item, a photo or your whole account in one tap.", icon: <Icon.Close className="h-[18px] w-[18px] text-plum" /> },
  { title: "Not a shopping app", body: "WearWise will never push you to buy new clothes.", icon: <Icon.Heart className="h-[18px] w-[18px] text-plum" /> },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-ivory">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo size={20} />
        <nav className="flex items-center gap-4 sm:gap-6">
          <Link href="#how" className="hidden text-sm text-graphite hover:text-charcoal sm:inline">How it works</Link>
          <Link href="#privacy" className="hidden text-sm text-graphite hover:text-charcoal sm:inline">Privacy</Link>
          <Link href="/login" className="text-sm text-graphite hover:text-charcoal">Log in</Link>
          <Button asChild size="sm">
            <Link href="/login">Get started</Link>
          </Button>
        </nav>
      </header>

      <main className="animate-fade-in">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pt-12">
          <div>
            <p className="ww-eyebrow mb-5 flex items-center gap-1.5 text-plum">
              <Icon.Sparkle className="h-3 w-3" /> Private AI · Daily outfit assistant
            </p>
            <h1 className="ww-display text-[2.75rem] leading-[1.0] text-charcoal sm:text-6xl lg:text-7xl">
              Never waste another morning <em>deciding what to wear.</em>
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-graphite sm:text-lg">
              WearWise turns your wardrobe, weather and plans into one confident outfit
              recommendation — using clothes you already own.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/login">
                  Get today&apos;s outfit <Icon.ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="#how">See how it works</Link>
              </Button>
            </div>

            <p className="mt-6 flex items-center gap-2 text-xs text-graphite">
              <Icon.Lock className="h-3.5 w-3.5" />
              Private wardrobe. No public profile. Delete anytime.
            </p>

            {/* Editorial micro-stats */}
            <dl className="mt-10 flex gap-8 border-t border-hairline pt-7">
              {[
                ["30s", "To decide each morning"],
                ["1", "Confident outfit per day"],
                ["0", "Shopping. Social. Pressure."],
              ].map(([stat, label]) => (
                <div key={label}>
                  <dt className="font-serif text-3xl leading-none text-plum">{stat}</dt>
                  <dd className="mt-1.5 text-xs text-graphite">{label}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Hero visual — signature Outfit Stack on a soft panel */}
          <div className="relative flex justify-center">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 top-8 rounded-ww-xl bg-gradient-to-b from-lavender/20 to-stone"
            />
            <div className="relative py-6">
              <OutfitStack />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-t border-hairline">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
            <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="ww-eyebrow mb-3">How it works</p>
                <h2 className="ww-display text-3xl text-charcoal sm:text-4xl lg:text-5xl">
                  Three steps. One <em>confident</em> outfit.
                </h2>
              </div>
              <p className="max-w-xs text-sm text-graphite">
                Built for fast mornings. Like getting dressed with a trusted friend who
                already knows your closet.
              </p>
            </div>

            <ol className="grid gap-4 md:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n} className="rounded-ww-lg border border-hairline bg-bone p-6 shadow-ww-sm sm:p-7">
                  <div className="mb-7 flex items-start justify-between">
                    <span className={`grid h-12 w-12 place-items-center rounded-ww-md ${s.tint}`}>{s.icon}</span>
                    <span className="font-mono text-xs text-mist">{s.n} / 03</span>
                  </div>
                  <h3 className="font-serif text-2xl leading-tight tracking-tight text-charcoal">{s.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-graphite">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* The promise — pull quote */}
        <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
          <div className="grid items-center gap-8 rounded-ww-xl bg-stone p-8 sm:p-12 lg:grid-cols-2 lg:gap-12 lg:p-16">
            <div>
              <p className="ww-eyebrow mb-4">The promise</p>
              <blockquote className="ww-display text-3xl text-charcoal sm:text-4xl lg:text-5xl">
                One smart outfit for your <em>real day.</em>
              </blockquote>
              <p className="mt-6 max-w-md text-base leading-relaxed text-graphite">
                Not shopping. Not styling. Not a social feed. Just a calm, intelligent decision
                for the morning ahead — using clothes you already own.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                "Polished without trying too hard.",
                "Good match for today's weather.",
                "Comfortable for long wear.",
                "Sharp enough for work.",
              ].map((q) => (
                <p key={q} className="rounded-ww-md bg-bone p-4 font-serif text-base leading-snug text-charcoal shadow-ww-xs">
                  “{q}”
                </p>
              ))}
            </div>
          </div>
        </section>

        {/* Trust / privacy band */}
        <section id="privacy" className="border-t border-hairline">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <p className="ww-eyebrow mb-8">Built for trust</p>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {TRUST.map((t) => (
                <li key={t.title} className="rounded-ww-lg border border-hairline bg-bone p-6 shadow-ww-sm">
                  <span className="mb-5 grid h-10 w-10 place-items-center rounded-ww-sm bg-plum/[0.07]">{t.icon}</span>
                  <h3 className="text-base font-medium text-charcoal">{t.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-graphite">{t.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      {/* Footer CTA */}
      <footer className="bg-charcoal text-bone">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
            <h2 className="ww-display text-4xl text-bone sm:text-5xl lg:text-6xl">
              Open WearWise. <em className="text-champagne">Get dressed.</em>
            </h2>
            <div>
              <p className="mb-7 text-base leading-relaxed text-bone/70">
                The calm, intelligent wardrobe assistant people open before they get dressed.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="bg-bone text-charcoal hover:bg-paper">
                  <Link href="/login">
                    Get today&apos;s outfit <Icon.ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <span className="flex items-center gap-2">
                  <ConfidenceRing value={87} size={40} variant="dark" />
                  <span className="text-xs text-bone/60">Avg. style match</span>
                </span>
              </div>
            </div>
          </div>

          <div className="mt-14 flex flex-col gap-3 border-t border-bone/10 pt-7 text-xs text-bone/50 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-3">
              <Logo size={16} className="text-bone" />
              <span className="font-mono tracking-[0.1em]">© 2026 WEARWISE</span>
            </span>
            <span className="flex gap-5">
              <Link href="#privacy" className="hover:text-bone">Privacy</Link>
              <Link href="#" className="hover:text-bone">Terms</Link>
              <Link href="/login" className="hover:text-bone">Log in</Link>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
