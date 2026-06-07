# ProjectX

Private trading research workspace inspired by the Edgeful-style workflow, built from scratch with Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, PostgreSQL, Prisma, Twelve Data, and the OpenAI Responses API.

## Architecture

- `src/app` contains the App Router pages and route handlers.
- `src/components` contains the SaaS workspace shell, AI chat, report surfaces, charting, and shadcn/ui primitives.
- `src/server` contains ingestion, Twelve Data and Alpha Vantage parsing, statistical analysis, report generation, SQL safety, and AI orchestration.
- `src/lib` contains Prisma, auth, shared utilities, and platform constants.
- `prisma/schema.prisma` defines users, datasets, candles, trading-day aggregates, reports, studies, and AI research sessions.

## Workflow

1. Register or sign in through the private auth routes.
2. Ingest Nasdaq data from Twelve Data or upload OHLCV CSV data.
3. The ingestion service normalizes timestamps to `America/New_York`, derives context-session and regular-session features, and stores daily session aggregates.
4. Reports and the pattern explorer run deterministic statistics first.
5. AI Research streams a natural-language answer, references source datasets, shows the SQL/query plan, summarizes calculations, flags weak samples, and suggests follow-ups.

The dashboard, reports, pattern explorer, session analyzer, and AI source panel are real-data only. When PostgreSQL has no ingested dataset, the app shows `No data available yet` instead of fabricated metrics.

## Important Data Note

The platform is configured for intraday research. Twelve Data is the default provider for `1min`, `15min`, `1h`, and `4h` OHLCV data. Alpha Vantage can still be selected when the key has intraday access, and OHLCV CSV uploads are also supported. Daily candles are not used for dashboard, report, pattern, or AI research statistics. When Twelve Data pre/post-market access is not available, the engine uses 09:30-09:59 ET as opening context and 10:00-15:59 ET as the response session.

Alpha Vantage can still be selected when the key has intraday access. Twelve Data pre/post-market data requires a paid provider plan; without that plan, ProjectX uses regular-session minute candles only.

## Bundled OHLCV Data

Real Nasdaq-tracking QQQ OHLCV CSV files are published as static website assets:

- `/data/nasdaq-qqq-1min-ohlcv.csv` - 194,282 one-minute QQQ candles from Twelve Data, `2024-06-05` to `2026-06-05`.
- `/data/nasdaq-qqq-15min-ohlcv.csv` - 12,960 fifteen-minute QQQ candles from Twelve Data, `2024-06-05` to `2026-06-05`.
- `/data/nasdaq-qqq-1h-ohlcv.csv` - 3,492 one-hour QQQ candles from Twelve Data, `2024-06-05` to `2026-06-05`.
- `/data/nasdaq-qqq-4h-ohlcv.csv` - 999 four-hour QQQ candles from Twelve Data, `2024-06-05` to `2026-06-05`.
- `/data/nasdaq-ohlcv-manifest.json` - file metadata, row counts, and coverage ranges.

In Settings, use the bundled OHLCV ingest buttons to load the supported minute files server-side into PostgreSQL. This still requires a working `DATABASE_URL`, because ingested candles and derived session statistics are stored in the database. When Vercel has no usable database, the AI and ICT pattern terminal read the bundled 15M, 1H, and 4H files directly for deterministic research answers.

The ICT terminal includes a PM research view for New York `12:00` through the available close. The current bundled Twelve Data files are regular-session files and do not include `16:00-16:30` after-hours bars. Twelve Data exposes pre/post-market candles through `prepost=true`, but the current key must be on a plan that supports extended-hours data before those bars can be fetched and bundled.

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
- `POST /api/datasets/ingest-market-data`
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

Then open Settings and fetch market data. The default market is `NASDAQ`; the app keeps `NASDAQ` as the platform ticker and stores any provider-specific symbol in dataset metadata.

## Vercel Deployment

Set these environment variables in Vercel:

- `DATABASE_URL`
- `JWT_SECRET`
- `TWELVE_DATA_API_KEY`
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

The AI layer uses the Responses API for new AI workflows and streaming. The default model is `gpt-5-mini` for a cost-balanced research chat experience, with medium reasoning effort, medium verbosity, and a max output token cap. It keeps database execution server-side, only allows read-only SQL against approved analytics tables, and always pairs model commentary with deterministic statistical calculations.
