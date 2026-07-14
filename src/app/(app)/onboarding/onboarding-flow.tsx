"use client";

// =====================================================================
// WearWise — Onboarding v2 (Phase 4D)
// Mobile-first, 6-step sequence: Welcome -> Context -> Style -> Wardrobe ->
// Ready -> Completion. One primary action visible per step, progress shown,
// every question skippable unless explicitly required. Resume-safe: the
// furthest-reached step is persisted (`onboarding_step`); this component
// starts at max(persisted step, "welcome") and only ever ADVANCES that
// value, never regresses it, and every save is a targeted `.update()` on
// exactly the fields that step owns — no other profile field is ever
// touched, so resuming never loses or overwrites prior answers.
//
// NOT rendered inside the shared tabbed <Screen> shell (Phase 4A/4B) —
// onboarding is a focused, linear flow, not a tab; showing the bottom
// TabBar mid-flow would let a new user leave with zero clothes and no
// selected occasion, defeating "Ready for Today" gating. This preserves
// the existing Today/Wardrobe/Style Me/Plan/You shell completely untouched.
// =====================================================================
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { ViewBeacon } from "@/components/wearwise/ViewBeacon";
import { computeWardrobeReadiness, furthestOf, type OnboardingWardrobeItem } from "@/lib/onboarding";
import type { OnboardingStep } from "@/lib/types";

const STEPS: OnboardingStep[] = ["welcome", "context", "style", "wardrobe", "ready", "completed"];
const STEP_LABELS: Record<OnboardingStep, string> = {
  welcome: "Welcome",
  context: "About you",
  style: "Style",
  wardrobe: "Wardrobe",
  ready: "Ready",
  completed: "Done",
};

const STYLES = ["Minimal", "Traditional", "Bold", "Elegant", "Trendy", "Comfort-first"];

const DEFAULT_OCCASION_OPTIONS: { key: string; label: string }[] = [
  { key: "work", label: "Work" },
  { key: "casual", label: "Casual" },
  { key: "college", label: "College" },
  { key: "date", label: "Date / dinner" },
  { key: "travel", label: "Travel" },
  { key: "family_function", label: "Family & festive" },
];

interface InitialProfile {
  full_name: string;
  city: string;
  style_preferences: string[];
  default_occasion: string;
  onboarding_step: OnboardingStep | null;
}

export function OnboardingFlow({
  initial,
  initialWardrobeItems,
}: {
  initial: InitialProfile;
  initialWardrobeItems: OnboardingWardrobeItem[];
}) {
  const router = useRouter();

  const startStep = initial.onboarding_step ?? "welcome";
  const [furthest, setFurthest] = useState<OnboardingStep>(furthestOf(startStep, "welcome"));
  const [view, setView] = useState<OnboardingStep>(startStep === "completed" ? "wardrobe" : startStep);

  const [fullName, setFullName] = useState(initial.full_name);
  const [city, setCity] = useState(initial.city);
  const [defaultOccasion, setDefaultOccasion] = useState(initial.default_occasion);
  const [styles, setStyles] = useState<string[]>(initial.style_preferences);
  const [wardrobeItems] = useState<OnboardingWardrobeItem[]>(initialWardrobeItems);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const readiness = useMemo(() => computeWardrobeReadiness(wardrobeItems), [wardrobeItems]);

  function advanceTo(step: OnboardingStep) {
    setFurthest((cur) => furthestOf(cur, step));
    setView(step);
  }

  async function saveProfile(fields: Record<string, unknown>, nextStep: OnboardingStep): Promise<boolean> {
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return false; }

    const step = furthestOf(furthest, nextStep);
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ ...fields, onboarding_step: step })
      .eq("id", user.id);

    setSaving(false);
    if (updErr) {
      track("onboarding_failed", { stage: nextStep });
      setError("We couldn't save that. Please try again.");
      return false;
    }
    return true;
  }

  const stepIndex = STEPS.indexOf(view);

  return (
    <main className="flex min-h-dvh flex-col bg-background px-6 pb-8 pt-6">
      <ViewBeacon event="onboarding_started" />

      {view !== "completed" && (
        <div
          className="mb-6 flex items-center gap-1.5"
          aria-label={`Step ${stepIndex + 1} of ${STEPS.length - 1}: ${STEP_LABELS[view]}`}
        >
          {STEPS.slice(0, 5).map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i <= stepIndex ? "bg-plum" : "bg-hairline"
              )}
            />
          ))}
        </div>
      )}

      <div className="flex-1">
        {view === "welcome" && (
          <WelcomeStep onStart={() => advanceTo("context")} />
        )}

        {view === "context" && (
          <ContextStep
            fullName={fullName} setFullName={setFullName}
            city={city} setCity={setCity}
            defaultOccasion={defaultOccasion} setDefaultOccasion={setDefaultOccasion}
            saving={saving} error={error}
            onNext={async () => {
              if (!fullName.trim()) { setError("Let us know what to call you."); return; }
              if (!defaultOccasion) { setError("Pick the occasion you dress for most."); return; }
              const ok = await saveProfile(
                {
                  full_name: fullName.trim(),
                  city: city.trim() || null,
                  default_occasion: defaultOccasion,
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
                },
                "context"
              );
              if (ok) {
                track("onboarding_context_completed", {
                  city_present: Boolean(city.trim()),
                  default_occasion: defaultOccasion,
                });
                advanceTo("style");
              }
            }}
          />
        )}

        {view === "style" && (
          <StyleStep
            styles={styles} setStyles={setStyles}
            saving={saving} error={error}
            onNext={async (skipped: boolean) => {
              const ok = await saveProfile({ style_preferences: skipped ? [] : styles }, "style");
              if (ok) {
                track("onboarding_style_completed", { skipped, style_count: skipped ? 0 : styles.length });
                advanceTo("wardrobe");
              }
            }}
          />
        )}

        {view === "wardrobe" && (
          <WardrobeStep
            readiness={readiness}
            saving={saving}
            onContinue={async (skipped: boolean) => {
              if (skipped) track("onboarding_wardrobe_skipped", { wearable_count: readiness.wearableCount });
              const ok = await saveProfile({}, "wardrobe");
              if (ok) advanceTo("ready");
            }}
          />
        )}

        {view === "ready" && (
          <ReadyStep
            readiness={readiness}
            saving={saving}
            error={error}
            onFinish={async () => {
              const ok = await saveProfile({ onboarded: true }, "completed");
              if (ok) {
                track("onboarding_completed", {
                  city_present: Boolean(city.trim()),
                  style_preferences_count: styles.length,
                  wardrobe_ready: readiness.ready,
                  wearable_count: readiness.wearableCount,
                });
                router.push("/dashboard");
                router.refresh();
              }
            }}
          />
        )}
      </div>
    </main>
  );
}

function WelcomeStep({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex min-h-[70vh] flex-col justify-center text-center">
      <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full bg-lavender/20">
        <Icon.Hanger className="h-7 w-7 text-plum" />
      </div>
      <h1 className="ww-display text-3xl text-charcoal">
        Never wonder <em className="text-plum">what to wear</em> again.
      </h1>
      <p className="mx-auto mt-3 max-w-xs text-sm text-graphite">
        Upload your clothes once. Get a real outfit idea from what you already own — starting today.
      </p>
      <Button onClick={onStart} size="full" className="mt-8">
        Start <Icon.ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ContextStep({
  fullName, setFullName, city, setCity, defaultOccasion, setDefaultOccasion,
  saving, error, onNext,
}: {
  fullName: string; setFullName: (v: string) => void;
  city: string; setCity: (v: string) => void;
  defaultOccasion: string; setDefaultOccasion: (v: string) => void;
  saving: boolean; error: string; onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="ww-eyebrow mb-1">A few basics</p>
        <h2 className="ww-display text-2xl text-charcoal">What should we call you?</h2>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Preferred name</Label>
        <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="First name" />
      </div>

      <div className="space-y-2">
        <Label>What do you dress for most?</Label>
        <div className="grid grid-cols-2 gap-2">
          {DEFAULT_OCCASION_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setDefaultOccasion(o.key)}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                defaultOccasion === o.key ? "border-plum bg-plum/10 text-plum" : "border-border bg-card text-charcoal"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Sets your default in Style Me — you can change it anytime.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="city">City <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Pune" />
        <p className="text-xs text-muted-foreground">Used only for weather-aware suggestions. Skip if you&apos;d rather not share it.</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={onNext} size="full" disabled={saving}>
        {saving ? "Saving…" : "Continue"}
      </Button>
    </div>
  );
}

function StyleStep({
  styles, setStyles, saving, error, onNext,
}: {
  styles: string[]; setStyles: (fn: (cur: string[]) => string[]) => void;
  saving: boolean; error: string; onNext: (skipped: boolean) => void;
}) {
  function toggle(s: string) {
    setStyles((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }
  return (
    <div className="space-y-6">
      <div>
        <p className="ww-eyebrow mb-1">Optional</p>
        <h2 className="ww-display text-2xl text-charcoal">How would you describe your style?</h2>
        <p className="mt-2 text-sm text-graphite">Pick any that fit. This nudges suggestions — it&apos;s not a personality test.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STYLES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggle(s)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              styles.includes(s) ? "border-rose bg-rose/15 text-plum" : "border-border bg-card"
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2">
        <Button onClick={() => onNext(false)} size="full" disabled={saving}>
          {saving ? "Saving…" : "Continue"}
        </Button>
        <Button onClick={() => onNext(true)} variant="secondary" size="full" disabled={saving}>
          Skip
        </Button>
      </div>
    </div>
  );
}

function WardrobeStep({
  readiness, saving, onContinue,
}: {
  readiness: ReturnType<typeof computeWardrobeReadiness>;
  saving: boolean;
  onContinue: (skipped: boolean) => void;
}) {
  const haveAny = readiness.wearableCount > 0;
  return (
    <div className="space-y-6">
      <ViewBeacon event="onboarding_wardrobe_started" />
      <div>
        <p className="ww-eyebrow mb-1">Your wardrobe</p>
        <h2 className="ww-display text-2xl text-charcoal">Add a few clothes to get started.</h2>
        <p className="mt-2 text-sm text-graphite">
          For one honest outfit, we need at least a top (or dress) and a bottom. Shoes help but aren&apos;t required.
        </p>
      </div>

      <ul className="space-y-2 rounded-ww-md border border-hairline bg-bone p-4 text-sm">
        <ReadinessRow label="Tops / uppers" done={readiness.tops} />
        <ReadinessRow label="Bottoms" done={readiness.bottoms} />
        <ReadinessRow label="Footwear (optional)" done={readiness.shoes} optional />
      </ul>

      {haveAny && (
        <p className="text-xs text-muted-foreground">
          You have {readiness.wearableCount} wearable {readiness.wearableCount === 1 ? "item" : "items"} so far.
        </p>
      )}

      <div className="space-y-2">
        <Button asChild size="full">
          <Link href="/wardrobe/upload"><Icon.Plus className="h-4 w-4" /> Add clothes now</Link>
        </Button>
        <Button onClick={() => onContinue(!readiness.ready)} variant="secondary" size="full" disabled={saving}>
          {saving ? "Saving…" : "Continue with what I have"}
        </Button>
      </div>
    </div>
  );
}

function ReadinessRow({ label, done, optional }: { label: string; done: boolean; optional?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-full",
          done ? "bg-sage/20 text-sage-dark" : "bg-hairline text-muted-foreground"
        )}
      >
        {done ? <Icon.Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      </span>
      <span className={cn("text-charcoal", !done && optional && "text-graphite")}>{label}</span>
    </li>
  );
}

function ReadyStep({
  readiness, saving, error, onFinish,
}: {
  readiness: ReturnType<typeof computeWardrobeReadiness>;
  saving: boolean; error: string; onFinish: () => void;
}) {
  return (
    <div className="flex min-h-[70vh] flex-col justify-center text-center">
      <ViewBeacon event="onboarding_ready" props={{ ready: readiness.ready }} />
      <div className={cn(
        "mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full",
        readiness.ready ? "bg-sage/20" : "bg-champagne/25"
      )}>
        {readiness.ready
          ? <Icon.Check className="h-7 w-7 text-sage-dark" />
          : <Icon.Sparkle className="h-7 w-7 text-plum" />}
      </div>

      {readiness.ready ? (
        <>
          <h1 className="ww-display text-2xl text-charcoal">Ready for Today.</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-graphite">
            You have enough in your wardrobe for a real outfit idea.
          </p>
        </>
      ) : (
        <>
          <h1 className="ww-display text-2xl text-charcoal">Add one more item to improve recommendations.</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-graphite">
            You can still continue — we&apos;ll be upfront if today&apos;s outfit is incomplete.
          </p>
        </>
      )}

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <div className="mt-8 space-y-2">
        {!readiness.ready && (
          <Button asChild variant="secondary" size="full">
            <Link href="/wardrobe/upload"><Icon.Plus className="h-4 w-4" /> Add another item</Link>
          </Button>
        )}
        <Button onClick={onFinish} size="full" disabled={saving}>
          {saving ? "Finishing…" : "Go to Today"}
        </Button>
      </div>
    </div>
  );
}
