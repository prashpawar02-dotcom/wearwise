import { Suspense } from "react";
import { AppHeader } from "@/components/nav/app-header";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="min-h-dvh">
      <AppHeader back="/" />
      <div className="px-6 pt-8 animate-fade-in">
        <h1 className="font-serif text-3xl font-semibold">Welcome</h1>
        <p className="mt-2 text-muted-foreground">
          Sign in with your email. We&apos;ll send you a secure link — no password to remember.
        </p>
        <div className="mt-8">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
