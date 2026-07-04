import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Exclude /api/* so API route handlers run directly and do their OWN auth
  // (e.g. the cron route checks CRON_SECRET; the manual prepare route checks the
  // session). Without this, the session-refresh middleware would redirect an
  // unauthenticated API call (like the server-to-server cron) to /login.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)"],
};
