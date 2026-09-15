# Backlog — Load Testing, Async Pipeline, K8s Deployment, Similar Quotes RAG

Each epic has a "definition of done" tied to a specific resume bullet — don't word the bullet until the DoD is met with real numbers/behavior, not placeholders.

---

## Sprint status (updated 2026-09-14)

| Epic | Status |
|------|--------|
| 1. Load testing + Playwright E2E | ✅ Done |
| 2. Async pipeline — RabbitMQ + WebSocket | 🔵 In progress (cards 1–3 done) |
| 3. Kubernetes deployment | ⬜ Backlog |
| 4. Observability — Prometheus + Grafana | ⬜ Backlog |
| 5. Similar past quotes — RAG epic | ⬜ Backlog (architecture decided, see §28 arch doc) |

### Completed this sprint (not part of the epics above)
- `sonar-project.properties` created — specs, seeds, migrations excluded from Sonar analysis and coverage
- Stale closure fixed in `QuotationDetailPage` (`useRef` for `pendingAction` in `onCompleted`)
- Flaky test fixed in `AIInsightCard` — missing `await` on `userEvent.click` in loading-state test
- Apollo cache warning silenced — `version` field added to `baseQuotation` test fixture
- `AiInsight` cache invalidated on `updateStatus` (was already done on `updateQuotation`)
- XML/prompt injection fixed — `escapeXml()` applied to all user-controlled fields in `buildPrompt` / `buildSystemPrompt`
- Hybrid search implemented — BM25 + RRF in `searchLessonsLearned`

---

## 0. Unrelated cleanup found during scoping

`backend/prisma/migrations/20260903000000_add_hybrid_search/migration.sql` is a 0-byte file — the migration directory exists but captured no SQL. Not part of this backlog, but will cause `prisma migrate deploy` to silently no-op that step. Flag/fix separately before it causes confusion.

---

## 1. Load testing + Playwright E2E in CI 🔵 IN PROGRESS

**Target resume bullet:**
> Load-tested with [X] synthetic quotation records across [X] simulated sales reps to validate query performance under realistic volume; identified and resolved a slow filtered-search query, improving p95 latency from [X]ms to [X]ms. Covered core flows with a Playwright E2E test suite integrated into CI.

Note: schema is single-tenant (no `Organization` model) — say "simulated sales reps," not "organizations," unless multi-tenancy gets added separately.

**The real bug to fix (already confirmed in code):**
`quotations.service.ts` `findAll()` search filter does case-insensitive `contains` OR across `title`, `quotationNumber`, `clientName` — none of which are indexed (`schema.prisma` only indexes `createdById`, `status`, `[createdById, status]`). A plain btree index won't help `contains`; needs `pg_trgm` extension + GIN trigram index on the three columns, or a switch to Postgres full-text search if scope allows.

**Steps:**
1. Add `@faker-js/faker` (dev dep) and write a bulk-seed script (separate from `seed.ts`, e.g. `seed-load-test.ts`) generating N synthetic reps + M quotations with randomized titles/client names/statuses. Start with something like 10k–50k quotations — big enough to expose a sequential scan, small enough to seed in CI/local in reasonable time.
2. Run `EXPLAIN ANALYZE` on the `findAll` search query before any index change — capture the actual plan (seq scan) and baseline latency under k6.
3. Write a k6 script hitting the GraphQL `quotations` query with realistic search terms and pagination, sustained load (e.g. 20-50 VUs for a couple minutes). Record p50/p95/p99.
4. Add the `pg_trgm` migration (new, real Prisma migration — not touching the broken empty one).
5. Re-run the same k6 script, record new p95. This before/after pair is your real number for the bullet — don't estimate it.
6. Add `@playwright/test` to `frontend`. Cover 2-3 golden paths: login → create quote → appears in list; update quote status; search/filter quotations. Keep it small and real rather than broad and flaky.
7. Add a new CI job to `.github/workflows/ci.yml` (alongside the existing Jest unit+e2e job, not replacing it) that builds frontend+backend, runs migrations/seed, starts both servers, and runs the Playwright suite.

**Definition of done:**
- [ ] Bulk-seed script exists and is documented (record count used)
- [ ] Baseline p95 measured and recorded (with EXPLAIN plan showing seq scan)
- [ ] Index/migration added, re-measured p95 recorded
- [ ] k6 script committed under e.g. `backend/load-tests/`
- [ ] Playwright suite covering the 2-3 flows above, passing locally
- [ ] New CI job green on a real PR
- [ ] `docs/lessons_learned.md` updated with the actual before/after numbers and what the fix was

---

## 2. Async pipeline — SNS/SQS + WebSocket

**Target resume bullet:**
> Implemented event-driven architecture using AWS SNS/SQS to decouple quote-creation notifications from the request path, and added WebSocket-based live status updates to eliminate client-side polling.

**Status:** Already fully scoped in `docs/prd-async-pipeline.md` (F0: SNS→SQS→consumer computes conversion score async; F1: socket.io gateway pushes `score.ready` to the frontend). No new planning needed — execute against that PRD's milestones and acceptance criteria as written, including its own DoD checklist (which already ends with the lessons-learned update).

One gap to double check while implementing: the PRD's "Out of scope" sections don't mention how existing synchronous scoring in `ai.service.ts` gets removed/gated once the consumer takes over — confirm F0 implementation actually removes the sync call path rather than leaving both running.

---

## 3. Kubernetes deployment (real managed cluster)

**Target resume bullet:**
> Containerized and deployed the platform to a managed Kubernetes cluster with autoscaling, moving from a single-instance deployment to a production-representative infrastructure setup.

**Current state:** `backend/Dockerfile` already exists (multi-stage, non-root, Node 20-alpine) — reusable as-is. No k8s manifests, no IaC, no cloud account config in-repo. Currently deployed via Railway (backend) + Vercel (frontend), no IaC checked in for either.

**Decision needed before starting:** EKS vs GKE — pick based on whichever you have (or can get) free-tier/credits for, since a real managed control plane has an hourly cost regardless of traffic. Plan for teardown between demo/screenshot sessions rather than leaving it running.

**Steps:**
1. Pick cluster provider (EKS or GKE) and provision via their CLI/console — don't hand-roll Terraform for this unless you specifically want that as an additional skill demonstration.
2. Write k8s manifests (or a small Helm chart): `Deployment` for the backend (reuse existing Dockerfile), `Service`, `HorizontalPodAutoscaler` (CPU-based is fine and honest — don't overstate to custom-metrics autoscaling unless actually implemented), `ConfigMap`/`Secret` for the existing env vars (`DATABASE_URL`, `JWT_SECRET`, `GROQ_API_KEY`, etc.).
3. Point `DATABASE_URL` at the existing Postgres (Neon, per the `$transaction` comment found in `quotations.service.ts`) — no need to migrate the DB itself into the cluster.
4. Load-test with the same k6 script from item 1 while manually or automatically triggering a scale event, to get a real "before/after" story for autoscaling (single instance vs scaled) — this is what makes the bullet demonstrable in an interview, not just deployed-and-forgotten.
5. Decide frontend fate: staying on Vercel is fine and normal (nobody puts a static SPA in k8s) — the bullet is about the backend's infra, so no need to move Vercel.
6. Take screenshots/notes of the HPA scaling event and pod count under load — you'll want this as interview evidence since a cluster you tear down afterward can't be demoed live.

**Definition of done:**
- [ ] Cluster provisioned (EKS or GKE), backend Deployment running and reachable
- [ ] HPA configured and triggered at least once under real load (k6), with recorded pod-count evidence
- [ ] Secrets managed via k8s `Secret`, not hardcoded manifests
- [ ] Teardown documented/scripted so cluster isn't left running idle accumulating cost
- [ ] `docs/lessons_learned.md` updated

---

## 4. Observability — Prometheus + Grafana

**Target resume tag:** `Prometheus | Grafana`

**Current state:** confirmed nothing exists today — no `prom-client`/`@willsoto/nestjs-prometheus` dependency, no `/metrics` endpoint. `main.ts` only exposes a plain `/health` route (`200 { status: 'ok' }`, deliberately no DB call, used for Railway's deploy probe).

**Steps:**
1. Add `@willsoto/nestjs-prometheus` (or plain `prom-client`) to the backend and expose a `/metrics` endpoint alongside the existing `/health` route.
2. Instrument metrics that are actually meaningful for this app, not generic filler:
   - GraphQL resolver latency (histogram), at least for `createQuotation` and `quotations` (the search path from item 1).
   - AI scoring latency + outcome counters in `ai.service.ts` — count fallback-chain hits per model (Groq primary vs. fallback), since that's a real, demoable signal specific to this project's architecture.
   - Basic process metrics (default Node/event-loop metrics the library provides for free).
3. Run Prometheus locally (or in-cluster once item 3's k8s work exists) scraping `/metrics`.
4. Stand up Grafana (local Docker container is enough — doesn't need to be in the k8s cluster) with a dashboard built from these metrics: request latency percentiles, AI fallback-chain hit rate, request volume.
5. If item 3 (Kubernetes) is done first, this pairs naturally: Prometheus scraping pods + a Grafana panel showing the HPA scale-out event from item 3's load test is a strong, coherent story for one interview answer instead of two disconnected ones.

**Definition of done:**
- [ ] `/metrics` endpoint live, scraped by a local (or in-cluster) Prometheus instance
- [ ] At least the two app-specific metrics above instrumented (resolver latency, AI fallback-chain counters) — not just default process metrics
- [ ] Grafana dashboard built and screenshotted, showing real data (ideally captured during the item-1 or item-3 load test, not idle/empty)
- [ ] `docs/lessons_learned.md` updated

---

## 5. Similar Past Quotes — RAG Epic

**Target resume bullet (after completion):**
> "Dual RAG pipelines — lessons-learned playbook retrieval (RRF fusion of pgvector cosine similarity and Postgres tsvector full-text search) and similar past quotations retrieval (pgvector semantic search with ts_rank keyword re-ranking, role-scoped, embeddings regenerated on status change via RabbitMQ consumer)"

**Dependency:** Async pipeline (Epic 2) must be at least at card 5 (QueueConsumerModule running) before starting card 3 of this epic — the similar-quotes embedding generation hooks into the same RabbitMQ consumer.

**What the feature does:**
A rep opens "New Quotation," types a title or description, and sees a "Similar past quotes" sidebar showing 3 past quotations — client name, total, outcome (APPROVED/REJECTED), and a "Use as template" button. Surfaces pricing precedent, anchors new quotes to what has historically converted.

**Why ts_rank (not boolean tsvector like lessons-learned):**
Quotation item descriptions have enough token density for term frequency to be meaningful signal. `ts_rank` is Postgres's TF-IDF approximation — it distinguishes a quote mentioning "ERP integration" five times from one mentioning it once. The lessons-learned keyword leg uses an unranked boolean filter (results fused by position only). This epic is the first place in the project where ts_rank is used correctly, enabling an honest "BM25-approximation" claim on the resume.

**Cards:**

| # | Card | Notes |
|---|---|---|
| 1 | Prisma migration — `QuotationEmbedding` table | Add `searchText String`, `embedding vector(1536)`, `updatedAt`. Raw SQL migration adds generated `tsvector` column + GIN + ivfflat indexes. |
| 2 | Embedding generation service | Build `searchText` from quotation fields including outcome. Call OpenAI `text-embedding-3-small`. Upsert `QuotationEmbedding`. |
| 3 | Wire into `quote.created` consumer | After score upsert in card-5 consumer, call embedding service. One message, two writes. |
| 4 | `quote.status_changed` event | Publish from `updateStatus()` in `QuotationsService`. Consumer regenerates embedding because `outcome` field is now stale. |
| 5 | Retrieval service | Parallel pgvector + ts_rank queries, RRF fusion (k=60), role-scoped WHERE on `createdById`. |
| 6 | GraphQL query | `similarQuotations(query: String!): [SimilarQuotationType!]!` — returns id, title, clientName, total, status, createdBy. SALES_REP sees own quotes; SALES_MANAGER sees all. |
| 7 | Frontend sidebar | "Similar past quotes" panel on New Quotation form. Shows 3 results, each with outcome badge and "Use as template" button that prefills the form. |
| 8 | Unit tests | Retrieval service mock-DB tests; RRF fusion logic unit tests with known inputs/outputs. |
| 9 | Update `lessons_learned.md` + finalize resume bullet | Only after end-to-end works in dev and retrieval is verified on real data. |

**Definition of done:**
- [ ] Migration applied; `QuotationEmbedding` rows generated for all existing quotations (backfill script)
- [ ] New quotations automatically get an embedding via the RabbitMQ consumer
- [ ] Status transitions (APPROVED/REJECTED) trigger embedding regeneration
- [ ] `similarQuotations` query returns role-scoped results ranked by RRF score
- [ ] Frontend sidebar renders correctly; "Use as template" prefills the form
- [ ] Unit tests for retrieval service and RRF logic passing
- [ ] `docs/lessons_learned.md` updated
- [ ] Resume bullet finalised with accurate technical terms (ts_rank, not BM25; RRF fusion)

**Honest tradeoff to capture in lessons_learned:**
The RRF fusion here uses `ts_rank` scores normalised to rank positions — not the raw float scores from `ts_rank`. This is slightly less optimal than using the raw scores directly in a weighted combination, but consistent with the RRF formula (rank-based, not score-based) and avoids the need to normalise two different score scales. Acceptable tradeoff at this scale.