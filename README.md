# Nasdaq Research Terminal

Private trading research workspace inspired by the Edgeful-style workflow, built from scratch with Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, PostgreSQL, Prisma, Alpha Vantage, and the OpenAI Responses API.

## Architecture

- `src/app` contains the App Router pages and route handlers.
- `src/components` contains the SaaS workspace shell, AI chat, report surfaces, charting, and shadcn/ui primitives.
- `src/server` contains ingestion, Alpha Vantage parsing, statistical analysis, report generation, SQL safety, and AI orchestration.
- `src/lib` contains Prisma, auth, shared utilities, and platform constants.
- `prisma/schema.prisma` defines users, datasets, candles, trading-day aggregates, reports, studies, and AI research sessions.

## Workflow

1. Register or sign in through the private auth routes.
2. Ingest Nasdaq data from Alpha Vantage or upload OHLCV CSV data.
3. The ingestion service normalizes timestamps to `America/New_York`, derives context-session and regular-session features, and stores daily session aggregates.
4. Reports and the pattern explorer run deterministic statistics first.
5. AI Research streams a natural-language answer, references source datasets, shows the SQL/query plan, summarizes calculations, flags weak samples, and suggests follow-ups.

The dashboard, reports, pattern explorer, session analyzer, and AI source panel are real-data only. When PostgreSQL has no ingested dataset, the app shows `No data available yet` instead of fabricated metrics.

## Important Data Note

Alpha Vantage's US equity intraday endpoint supports extended-hours bars from 4:00am to 8:00pm Eastern Time. Because that feed does not cover the full overnight futures-style window, the built-in session engine uses a covered context session of 04:00 -> 09:25 ET and regular session from 09:30 ET. Use uploaded futures/CFD/index data when a complete overnight session is required.

## Report Modules

- Context vs Regular Session
- Gap Analysis
- Day Of Week
- Session Continuation
- Session Reversal
- Range Expansion
- High/Low Breaks
- Opening Drive
- Opening Range

## API Design

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/datasets`, `POST /api/datasets`
- `POST /api/datasets/ingest-alpha-vantage`
- `POST /api/datasets/upload`
- `GET /api/reports/[module]`
- `GET /api/stats/session`
- `GET /api/patterns`
- `GET/POST /api/studies`
- `POST /api/ai/chat`

## Local Setup

```bash
npm install
npm run build
```

Create `.env.local` for Next.js and `.env` for Prisma CLI commands. Both files should contain the same private values from `.env.example`.

```bash
cp .env.example .env.local
cp .env.example .env
```

Start PostgreSQL locally with Docker when available:

```bash
docker compose up -d postgres
```

Apply the schema and start the website:

```bash
npm run prisma:migrate
npm run dev
```

Then open Settings and fetch Alpha Vantage data. The default ticker is `QQQ`; use the month field (`YYYY-MM`) to request historical intraday months.

## Vercel Deployment

Set these environment variables in Vercel:

- `DATABASE_URL`
- `JWT_SECRET`
- `ALPHA_VANTAGE_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_REASONING_EFFORT`
- `OPENAI_VERBOSITY`
- `OPENAI_MAX_OUTPUT_TOKENS`
- `NEXT_PUBLIC_APP_URL`

Use a managed PostgreSQL database, then run Prisma migrations during deployment or from a secure local shell:

```bash
npm run prisma:deploy
```

## Verification

```bash
npm run test
npm run build
```

## OpenAI Integration

The AI layer uses the Responses API for new AI workflows and streaming. The default model is `gpt-5-mini` for a cost-balanced research chat experience, with low reasoning effort, low verbosity, and a max output token cap. It keeps database execution server-side, only allows read-only SQL against approved analytics tables, and always pairs model commentary with deterministic statistical calculations.
