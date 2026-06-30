/**
 * Shell for the authenticated/app screens. Keeps WearWise feeling like a
 * focused mobile-first product (centered, comfortable max width) without
 * hard-coding a fake-phone 390px frame. The public landing lives outside this
 * group and renders full-width.
 */
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[480px] bg-background">
      {children}
    </div>
  );
}
