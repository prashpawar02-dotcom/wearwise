# WearWise — Developer Runbook (sandbox vs. local)

This project is sometimes edited from an AI sandbox that **cannot reach external
production services**. This runbook draws a hard line between what the sandbox
can verify and what you must run yourself in **PowerShell on your machine**.

Run all commands from the project root:
`G:\projects\WearWise\WearWise Product + Build`

---

## 1. What the sandbox CAN verify

The sandbox is reliable for **code edits and static checks only**:

- TypeScript type-checking (`tsc --noEmit`)
- ESLint (`next lint`)
- Pure-function / logic review (no network, no DB)

Known sandbox limitations (these are **environment** issues, not app bugs — do
not treat them as code failures):

- Supabase calls fail with `ENOTFOUND` (no external network).
- `npm install` / package fetching is blocked (registry returns 403).
- `npm run build` may hang before compiling (it tries to fetch fonts/packages).
- The Linux mount occasionally shows **stale or truncated** copies of files that
  were just overwritten, even though the real Windows file is correct. When in
  doubt, the Windows file (and a fresh `git diff`) is the source of truth.

Because of the build hang, **a green build can only be claimed if it actually
passed locally or in CI/Vercel** — never from a sandbox build that hung.

---

## 2. What MUST be run locally (PowerShell)

Anything that needs the network, real data, a package install, or a full
production build:

- `npm install` (dependency changes)
- Supabase production data (audit scripts, smoke tests)
- OpenAI API calls (auto-tagging, outfit drafts)
- `npm run build` (especially if it hung in the sandbox)
- `vercel --prod` (deploy)

---

## 3. Exact local commands

```powershell
# Install dependencies (after any package.json change)
npm install

# Type-check (no emit) — same check the sandbox runs
npx tsc --noEmit
# or: npm run typecheck

# Lint
npm run lint

# Production build (run locally if the sandbox build hung)
npm run build

# Environment preflight (no secrets printed; safe anytime)
npm run preflight
# or: npx tsx --env-file=.env.local scripts/check-local-env.ts

# Audit invalid outfit drafts — DRY RUN (reads only, mutates nothing)
npx tsx --env-file=.env.local scripts/audit-invalid-outfit-drafts.ts

# Audit invalid outfit drafts — APPLY FIX (only after reviewing the dry-run)
npx tsx --env-file=.env.local scripts/audit-invalid-outfit-drafts.ts --fix

# Deploy to production (only after a clean local `npm run build`)
vercel --prod
```

Notes on the audit script:

- It is **dry-run by default** — it reads and reports, changing nothing.
- `--fix` only marks invalid **draft** suggestions as `rejected` (reversible;
  drafts are never shown to users). **Approved** invalid suggestions are
  reported as HIGH PRIORITY and are **never auto-changed** — a human re-curates.
- Do **not** pass `--fix` until you have reviewed the dry-run output and
  approved it.
- It needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` to read every user's rows
  (bypassing RLS). This is why it must run locally, never in the browser/app.

---

## 4. Security — `SUPABASE_SERVICE_ROLE_KEY`

The service-role key bypasses Row Level Security and can read/write every
user's data. Treat it as a top-level secret:

- **Local-only.** Lives in `.env.local` on your machine (and in Vercel project
  env / CI secrets if a server task ever needs it). Never commit it.
- **Never printed.** Scripts read it from the environment and must never log it.
- **Never referenced in `src/`.** It belongs only in `scripts/` (CLI tooling
  that does not ship to the browser). `npm run preflight` enforces this.
- **Never `NEXT_PUBLIC_*`.** Any `NEXT_PUBLIC_` variable is bundled into the
  browser. Prefixing a secret with `NEXT_PUBLIC_` would leak it to every user.
  `npm run preflight` fails if it sees a secret-looking `NEXT_PUBLIC_` var.

The app itself does not use the service-role key — it relies on the anon key +
RLS, and on short-lived signed URLs for private wardrobe photos.

---

## 5. Production deploy rule

1. **Do not deploy until `npm run build` passes locally.** A sandbox build that
   hung does not count.
2. Recommended pre-deploy sequence (local):
   ```powershell
   npm run preflight
   npm run lint
   npx tsc --noEmit
   npm run build
   vercel --prod
   ```
3. **After deploy, retest the invalid-outfit regression case:** run the audit in
   dry-run against production data and confirm no new physically-impossible
   outfits (e.g. kurta + kurta, dress + separate top) are being surfaced to
   users. Re-curate any APPROVED invalid suggestions the audit flags.

---

## 6. Quick reference

| Task | Where | Command |
|---|---|---|
| Type-check | sandbox or local | `npx tsc --noEmit` |
| Lint | sandbox or local | `npm run lint` |
| Env preflight | local | `npm run preflight` |
| Install deps | local | `npm install` |
| Build | local | `npm run build` |
| Audit (dry-run) | local | `npx tsx --env-file=.env.local scripts/audit-invalid-outfit-drafts.ts` |
| Audit (--fix) | local, after review | `...audit-invalid-outfit-drafts.ts --fix` |
| Deploy | local | `vercel --prod` |
