import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sparkles, Shirt, Calendar } from "lucide-react";

export default function LandingPage() {
  return (
    <main className="flex min-h-dvh flex-col px-6 pb-10 pt-16 animate-fade-in">
      <div className="flex-1">
        <p className="font-serif text-sm uppercase tracking-[0.25em] text-plum/70">WearWise · Beta</p>
        <h1 className="mt-4 font-serif text-4xl font-semibold leading-[1.1] text-foreground">
          Know what to wear today, from clothes you already own.
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          Upload your wardrobe once. Get thoughtful outfit ideas for work, college,
          travel, festivals and family occasions — without the morning stress.
        </p>

        <div className="mt-10 space-y-4">
          <Feature icon={<Shirt className="h-5 w-5 text-rose" />} title="Your wardrobe, organised"
            text="Add your clothes and tag them in seconds. Private to you, always." />
          <Feature icon={<Calendar className="h-5 w-5 text-sage" />} title="Pick an occasion"
            text="Work, festive, travel — tell us where you're headed." />
          <Feature icon={<Sparkles className="h-5 w-5 text-gold" />} title="Get 3 outfit ideas"
            text="Hand-curated looks you can wear today, then save what you wore." />
        </div>
      </div>

      <div className="mt-12 space-y-3">
        <Button asChild size="full">
          <Link href="/login">Join the beta</Link>
        </Button>
        <Button asChild variant="ghost" size="full">
          <Link href="/login">I already have an account</Link>
        </Button>
        <p className="pt-2 text-center text-xs text-muted-foreground">
          Closed beta · Your photos stay private
        </p>
      </div>
    </main>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-card p-4">
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
