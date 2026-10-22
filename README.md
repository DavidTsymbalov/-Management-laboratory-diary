# Management Laboratory

Gamified student points and achievements platform for a school team project. Students earn virtual **Nuts**, unlock achievements, and follow the class leaderboard. Teachers manage students and award points.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Supabase (auth + PostgreSQL — prepared, not wired yet)
- Lucide icons

## Live site (GitHub Pages)

https://davidtsymbalov.github.io/-Management-laboratory-diary/

Deploys automatically from `main` via `.github/workflows/deploy-github-pages.yml` (static `next export`).

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Local builds do not use the GitHub Pages `basePath`. CI sets `GITHUB_PAGES=true` so assets resolve under `/-Management-laboratory-diary/`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Production static export (`out/`) |
| `npm run start` | Not used for GitHub Pages (static host) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |

## Supabase setup (manual)

1. Create a project at [supabase.com](https://supabase.com).
2. Copy `.env.example` to `.env.local`.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Project Settings → API.
4. Restart `npm run dev`.

Authentication and database tables are intentionally not implemented yet. Helpers live in `src/lib/supabase/`.

## Notes

- The landing page includes a **demo preview** of a student dashboard. That data is static sample content only.
- Sign-in / Get started routes show setup states until Supabase env vars are present — no fake auth.
