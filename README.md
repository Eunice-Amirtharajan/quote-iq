# QuoteIQ

A B2B quotation management platform with AI-powered insights for sales teams.

**Live demo:** https://quoteiq.cc  
Demo credentials: Manager `marcus@quoteiq.com` / Sales Rep `anna@quoteiq.com` — password `password123`

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 · TypeScript · Tailwind CSS · Apollo Client |
| Backend | NestJS · GraphQL (Apollo Server, code-first) · Prisma ORM |
| Database | PostgreSQL (Neon DB — serverless, WebSocket driver) |
| Auth | JWT in HttpOnly cookies · Role-based access control |
| AI | Groq API (Llama 3.3 70B) · Zod response validation |
| Infra | Railway (backend, EU region) · Vercel (frontend) · Neon DB |

---

## Architecture Decisions

**NestJS over Express** — NestJS enforces a module/resolver/service structure with decorator-based dependency injection. Express is unopinionated and doesn't scale well across large teams. NestJS mirrors enterprise team organisation patterns and is TypeScript-first throughout.

**Separated React + NestJS over Next.js** — Separated frontend/backend architecture aligns with EU data residency compliance requirements, microservice patterns, and team organisation. The GraphQL API layer makes the separation clean and allows each layer to be deployed, scaled, and maintained independently.

**GraphQL over REST** — single endpoint, client specifies exact data needed, strongly typed schema shared between frontend and backend. Reduces overfetching on quotation list views where only summary fields are needed.

**JWT in HttpOnly cookies over localStorage** — prevents XSS token theft. Apollo Client sends the cookie automatically via `credentials: 'include'` — no manual header management needed.

**Neon WebSocket driver over pg pool** — Neon free tier pauses compute after 5 minutes of inactivity. The `PrismaNeon` WebSocket adapter maintains a lightweight connection and supports full Prisma transactions (implicit and explicit), including nested writes and `update+include`. A 4-minute keepalive ping prevents cold starts on the free tier. The initial implementation used `PrismaNeonHttp` (stateless HTTP per query) but was switched to `PrismaNeon` when nested Prisma writes — which use implicit transactions — failed with "Transactions are not supported in HTTP mode".

**Groq over Gemini** — Groq's free tier runs Llama 3.3 70B on dedicated inference hardware with significantly better availability than Gemini's free tier. The `callGroq()` helper walks through a ranked model list (Llama 3.3 70B → Llama 3.1 8B → Mixtral) and automatically fails over on 503/429 errors — self-healing without manual intervention.

**Railway EU over Render** — EU region deployment supports data residency requirements. Railway also supports Docker-based deploys which gives full control over the runtime environment.

---

## Features

### Implemented
- Sales reps create and manage clients and quotations with line items and tax calculation
- Auto-generated quotation numbers via PostgreSQL sequence (`QT-2026-0001`)
- Status workflow: DRAFT → SENT (rep submits for approval) → APPROVED / REJECTED (manager)
- Role-based transition enforcement — SALES_REP cannot approve or reject (blocked at service layer)
- Full status history tracked on every transition
- Quotation list filtering — status dropdown + debounced search (title, number, client name) with input sanitization (trim + 100-char cap at both frontend and backend)
- Manager dashboard with pipeline stats, conversion rate, and approved value
- AI-generated quotation summary with PROCEED / FOLLOW_UP / RECONSIDER recommendation
- Hybrid recommendation model — rules-based scoring anchors the Groq prompt, hard override prevents AI from reversing a RECONSIDER verdict
- 24-hour insight cache — avoids redundant API calls on repeated views

### In Progress
- Conversion likelihood score badge on SENT quotations (0–100, green/amber/red)
- Win/loss pattern analysis page — approval rate by deal size, by rep, clients at risk
- Natural language pipeline querying

---

## AI Architecture

The quotation summary uses a **hybrid model**:

1. **Rules engine** (`computeRecommendation`) scores the deal using client history — rejection rate > 60% → RECONSIDER, approval rate > 60% and deal within ±20% of average → PROCEED, else FOLLOW_UP
2. **Groq** receives the structured data plus the computed recommendation as an anchor — it can read unstructured signals (notes, line item descriptions) and override the rules, but only to upgrade or provide nuance
3. **Hard override** — if rules say RECONSIDER, that verdict is locked regardless of Groq output. Structured data cannot be overridden by qualitative reads
4. **Zod validates** every AI response before it's used — TypeScript types don't protect at runtime
5. **Prompt injection protection** — user-supplied content (notes, item descriptions, client name) is isolated inside `<quotation_data>` and `<client_data>` XML tags with explicit instructions to treat tag contents as data only
6. **Self-healing fallback** — if the primary model (Llama 3.3 70B) is overloaded, the service automatically retries with Llama 3.1 8B then Mixtral 8x7B

---

## Getting Started

```bash
# Backend
cd backend
cp .env.example .env        # fill in your values
npm install
npx prisma migrate dev
npx prisma db seed
npm run start:dev

# Frontend
cd frontend
cp .env.example .env.local  # fill in your values
npm install
npm run dev
```

---

## Environment Variables

**Backend** (`backend/.env`):

```bash
DATABASE_URL=""           # PostgreSQL connection string (e.g. from Neon DB)
JWT_SECRET=""             # Any long random string
JWT_EXPIRES_IN="7d"       # Token expiry — supports 7d, 24h, 30m etc.
GROQ_API_KEY=""           # Groq API key — free at console.groq.com
SEED_PASSWORD=""          # Password set for all seeded demo users (default: password123)
PORT=5000
NODE_ENV="development"
CORS_ORIGIN="http://localhost:5173"   # Comma-separated list of allowed frontend origins
LOG_LEVEL="info"
```

**Frontend** (`frontend/.env.local`):

```bash
VITE_API_URL="http://localhost:5000/graphql"   # Backend GraphQL endpoint
VITE_SHOW_DEMO_CREDENTIALS="true"              # Show demo login credentials on the login page
```

---

## Roles

| Role | Access |
|---|---|
| SALES_REP | Own clients and quotations only. Can create and submit DRAFT → SENT for manager approval |
| SALES_MANAGER | Full team visibility. Can approve/reject SENT quotations. Access to AI features and dashboard |
| ADMIN | Everything SALES_MANAGER can do plus user management and delete access |

---

## Seed Data

```bash
npx prisma db seed
```

Creates three users (one manager, two sales reps) and sample quotations across multiple clients with varied statuses and amounts. The seed password is controlled by `SEED_PASSWORD` in `.env` — defaults to `password123` if not set.

---

## Project Structure

```
quote-iq/
├── .github/workflows/      # CI/CD — test, build, deploy
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src/
│       ├── common/
│       │   ├── decorators/  # @CurrentUser, @Roles
│       │   ├── guards/      # JwtAuthGuard, RolesGuard
│       │   └── logger/      # Winston logger
│       ├── modules/
│       │   ├── ai/          # Groq integration, hybrid recommendation model
│       │   ├── auth/        # JWT, HttpOnly cookie, passport-jwt
│       │   ├── clients/
│       │   ├── dashboard/
│       │   ├── quotations/
│       │   └── users/
│       └── prisma/          # PrismaService with Neon WebSocket adapter + keepalive ping
├── frontend/
│   └── src/
│       ├── components/      # AIInsightCard, CreateQuotationModal, Layout
│       ├── context/         # AuthProvider, auth-context
│       ├── graphql/         # queries.ts, mutations.ts
│       ├── hooks/           # useAuth
│       ├── lib/             # Apollo client
│       └── pages/           # Dashboard, Quotations, Clients, QuotationDetail, Login
├── docs/
│   ├── cicd-flow.md         # Mermaid CI/CD diagram (renders on GitHub)
│   └── drawio/              # Architecture, ERD, sequence, AI pipeline diagrams
└── README.md
```

---

## Diagrams

Draw.io source files are in [`docs/drawio/`](docs/drawio/). Open with [Draw.io Desktop](https://github.com/jgraph/drawio-desktop/releases) or the [VS Code Draw.io Integration](https://marketplace.visualstudio.com/items?itemName=hediet.vscode-drawio) extension.

| Diagram | File | Description |
|---|---|---|
| HLD — System Architecture | [hld-system-architecture.drawio](docs/drawio/hld-system-architecture.drawio) | Full deployment topology — browser, Vercel, Railway, Neon DB, Groq |
| LLD — NestJS Module Architecture | [lld-nestjs-module-architecture.drawio](docs/drawio/lld-nestjs-module-architecture.drawio) | Internal module structure — resolver → service → Prisma, guard chain |
| ERD — Data Model | [erd-data-model.drawio](docs/drawio/erd-data-model.drawio) | All 6 tables with fields, types, indexes, and FK relationships |
| Auth Flow | [sequence-auth-flow.drawio](docs/drawio/sequence-auth-flow.drawio) | Login, authenticated request, page refresh session restore, logout |
| Request Lifecycle | [sequence-request-lifecycle.drawio](docs/drawio/sequence-request-lifecycle.drawio) | GraphQL request from browser through guards, resolver, service to DB and back |
| AI Pipeline | [ai-pipeline.drawio](docs/drawio/ai-pipeline.drawio) | Hybrid recommendation model — cache check, rules engine, Groq, Zod, hard override |
| CI/CD Pipeline | [cicd-pipeline.drawio](docs/drawio/cicd-pipeline.drawio) | GitHub Actions → test gate → Railway Docker deploy + Vercel CDN deploy |
| Infrastructure &amp; Observability | [infra-observability.drawio](docs/drawio/infra-observability.drawio) | Full deployment topology — Husky hooks, CI gates, Railway health check, UptimeRobot, Neon keepalive |

CI/CD flow also available as a [Mermaid diagram](docs/cicd-flow.md) (renders directly on GitHub).

---

## Quality Gates

Git hooks (via Husky) block commits and pushes that don't meet quality standards. Run `npm install` at the repo root to install them automatically.

| Hook | Checks | When |
|---|---|---|
| `pre-commit` | Frontend TS build · Frontend unit tests · Backend unit tests | Every `git commit` (~30s) |
| `pre-push` | Backend: ≥90% statements, ≥75% branches, ≥70% functions, ≥90% lines · Frontend: ≥95% statements, ≥90% branches, ≥90% functions, ≥95% lines | Every `git push` (~45s) |

E2E tests are excluded from hooks — they require Docker and run in CI instead.

---

## Observability

| What | Tool | Details |
|---|---|---|
| Uptime monitoring + alerts | UptimeRobot (free) | Probes `GET /health` (backend) and `https://quoteiq.cc` (frontend) every 5 min — email alert on down/recovery |
| Container health check + auto-restart | Railway (built-in) | `GET /health` every 30s — Railway restarts container automatically if it fails |
| CPU / memory / logs | Railway dashboard | Real-time metrics and stdout logs |
| Frontend performance + errors | Vercel Analytics | Page load times, error rates, geographic traffic |

The `/health` endpoint (`GET https://api.quoteiq.cc/health`) returns `{ "status": "ok" }` immediately with no DB call — safe for high-frequency probing.
