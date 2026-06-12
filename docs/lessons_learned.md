# Lessons Learned — QuoteIQ

A running log of real bugs hit during development, their root causes, and fixes.
Useful for code review prep, debugging intuition, and interview questions.

---

## 1. Apollo `useQuery` — GraphQL error treated as network failure

**Where:** `frontend/src/context/AuthProvider.tsx`

**Symptom:**
App shows "Could not connect. Please refresh." on every page load for unauthenticated users, instead of showing the login screen.

**Root Cause:**
`AuthProvider` fires a `me` query on mount to rehydrate session. When there is no cookie, the backend returns a GraphQL `UNAUTHENTICATED` error. Apollo's default `errorPolicy` is `'none'`, which means **any** error (including expected auth errors) populates the `error` field and leaves `data` as `undefined`. The component checked `if (error && !data)` and showed the error screen — it could not distinguish "server said Unauthorized" from "server is down".

**Fix:**
Set `errorPolicy: 'ignore'` on the query. This tells Apollo to silently discard GraphQL errors and treat the result as empty data (`undefined`). The component then falls through to render normally — showing the login screen to unauthenticated users.
```ts
const { loading, data, error } = useQuery(ME_QUERY, {
  fetchPolicy: 'cache-and-network',
  errorPolicy: 'ignore',
});
```
Keep the network error check for true connection failures (backend unreachable):
```ts
const isNetworkOnly = Boolean(error?.networkError) && !error?.graphQLErrors?.length;
```

**Interview angle:**
- Apollo has three error policies: `none` (default — throws on any error), `all` (returns both data and errors), `ignore` (silently drops errors). Know when each is appropriate.
- Authentication probe queries (like `me`) should always use `errorPolicy: 'ignore'` or `'all'` — Unauthorized is an expected, normal state, not a crash condition.
- `fetchPolicy: 'cache-and-network'` means Apollo returns cached data immediately, then re-fetches in the background. Good for session rehydration.

---

## 2. jsdom constraint validation blocks `onSubmit` in Vitest

**Where:** `frontend/src/components/CreateQuotationModal.test.tsx`

**Symptom:**
Tests for form validation errors ("Please select a client.", "All line items must have a description.") never saw the error message rendered — the assertion failed even though the logic was correct.

**Root Cause:**
HTML5 form elements with `required`, `min`, etc. go through **browser constraint validation** before the `onSubmit` handler fires. jsdom (the test environment) implements basic constraint validation — a `<select required>` with no value selected, or an `<input type="number" min="0.01">` with value `0`, causes the browser to call `event.preventDefault()` internally, so the React `onSubmit` handler is **never called**. Our JS validation code (which sets `formError`) therefore never ran.

**Fix:**
Remove all HTML5 constraint attributes (`required`, `min`) from inputs that are validated in JavaScript. Since we have JS validation covering every rule, the HTML5 attributes are redundant and actively harmful in test environments:
```tsx
// Before
<input type="number" min="0.01" required ... />
<select required ... />

// After — validate entirely in JS
<input type="number" step="0.01" ... />
<select ... />
```

**Interview angle:**
- jsdom implements constraint validation but not the browser's native validation UI (the tooltip). The result: `onSubmit` gets blocked silently, making tests appear to work differently from the browser.
- General rule: don't duplicate validation in both HTML attributes and JS. Pick one. For complex forms, JS validation gives more control and is fully testable.

---

## 3. Jest mock implementation leaking between tests

**Where:** `backend/src/modules/auth/auth.service.spec.ts`

**Symptom:**
A test that verified a `String(error)` branch (throwing a plain string instead of an `Error`) worked correctly, but the **next** test failed with `thrown: "plain string error"` — a completely unrelated test was seeing the mock that the previous test set up.

**Root Cause:**
`afterEach(() => jest.clearAllMocks())` clears **call counts and recorded calls**, but does **not** reset `mockImplementation`. So:
```ts
mockJwtService.sign.mockImplementation(() => { throw 'plain string error'; });
// test runs, passes
// afterEach runs — clears call counts, but sign still throws!
// next test calls sign → unexpected throw
```

**Fix:**
At the start of any test that overrides a mock with `mockImplementation`, reset it to the default at the beginning of the test (not at the end — the next test runs before cleanup):
```ts
it('uses default JWT_EXPIRES_IN of 7d', async () => {
  mockJwtService.sign.mockReturnValue('mock-jwt-token'); // reset first
  // ... rest of test
});
```
Or use `jest.resetAllMocks()` in `afterEach` instead of `clearAllMocks()` — `resetAllMocks` also clears implementations.

**Interview angle:**
- `clearAllMocks` ≠ `resetAllMocks` ≠ `restoreAllMocks`. Know the difference:
  - `clearAllMocks` — clears calls, instances, results. Keeps implementations.
  - `resetAllMocks` — clears everything above + implementations. Keeps spy/mock structure.
  - `restoreAllMocks` — restores original (non-mock) implementation. Only works for `jest.spyOn`.
- Test isolation bugs are among the hardest to debug because the failure appears in the wrong test. Always suspect mock state when a test fails only when run in sequence, not in isolation.

---

## 4. TypeScript decorator factory expressions counted as uncovered functions by Istanbul

**Where:** All NestJS resolver files (e.g. `quotations.resolver.ts`)

**Symptom:**
Resolver files showed ~75% function coverage and ~80% branch coverage despite every resolver method being called in unit tests.

**Root Cause:**
TypeScript compiles decorators like `@Mutation(() => QuotationType)` into function call expressions:
```js
__decorate([
  (0, graphql_1.Mutation)(() => quotation_entity_1.QuotationType), // ← Istanbul counts this arrow fn
  ...
], QuotationsResolver.prototype, "createQuotation", null);
```
Istanbul sees each `() => QuotationType` as a separate function expression. These are executed **once at class definition time** — when NestJS bootstraps the module and registers the schema. Unit tests that import the resolver class do trigger class definition, but Jest's module system caches imports, so decorators may not re-execute on each test run. The result: Istanbul marks these arrow functions as uncovered.

**Fix:**
E2E tests (via `supertest` against the full NestJS app) trigger the complete bootstrap pipeline, which re-executes all decorator registrations, pushing function coverage up. Unit tests alone cannot cover these lines.

**Interview angle:**
- Code coverage is a proxy metric, not a correctness guarantee. Istanbul's function count includes TypeScript-generated decorator wrapper functions that have nothing to do with your business logic.
- Know the difference between unit tests (mock dependencies, test logic) and E2E/integration tests (test the full stack, cover framework wiring). Both are necessary for a well-tested NestJS app.
- When you see mysteriously low function coverage in NestJS resolvers/controllers, check whether the uncovered lines are decorator factories — they need E2E tests to cover.

---

## 5. `Math.min(take, 100)` — page size cap

**Where:** `backend/src/modules/quotations/quotations.service.ts`

**Symptom / Risk:**
A caller could pass `take: 100000` to the GraphQL API and trigger a query returning 100,000 rows — potential DoS and memory exhaustion.

**Fix:**
```ts
take: Math.min(take, 100)
```
Cap the page size server-side regardless of what the client requests. Never trust client-supplied pagination parameters.

**Interview angle:**
- Always enforce server-side limits on pagination. Client-side pagination UI can be bypassed by anyone with curl.
- Pair with an index on the sorted/filtered column so large-skip queries (e.g. `OFFSET 10000`) don't do full table scans.

---

## 6. JWT_SECRET unsafe cast

**Where:** `backend/src/modules/auth/jwt.strategy.ts`

**Symptom / Risk:**
```ts
secretOrKey: process.env.JWT_SECRET as string
```
If `JWT_SECRET` is missing from the environment, this passes `undefined` as the signing secret — JWTs would be signed with `undefined`, which some libraries silently accept, making all tokens trivially forgeable.

**Fix:**
```ts
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET is not set');
super({ ..., secretOrKey: secret });
```
Fail fast at startup rather than silently producing insecure tokens.

**Interview angle:**
- `as string` in TypeScript is a lie to the compiler — it doesn't add any runtime check. Never use it to paper over possibly-undefined environment variables.
- Critical security configuration (secrets, keys) should cause an immediate startup crash if missing, not a subtle runtime failure later.
- The NestJS lifecycle means this check runs at module initialization — a missing secret kills the process before any request is ever handled.

---

## 7. SALES_REP routed to Dashboard fires a forbidden query

**Where:** `frontend/src/App.tsx`

**Symptom:**
SALES_REP users logging in were routed to the Dashboard page, which immediately fired a `dashboardStats` query. The backend's `RolesGuard` blocked the query (SALES_REP doesn't have permission), returning a GraphQL error — users saw a broken dashboard.

**Root Cause:**
The landing page logic did not check the user's role before rendering Dashboard. SALES_REPs have no dashboard access but were landing there after login.

**Fix:**
Route SALES_REPs to `/quotations` on login via role-aware redirect. The nav bar was already hiding the Dashboard link for SALES_REPs — the routing must be consistent with the nav.

**Interview angle:**
- Authorization must be enforced at every layer: backend (RolesGuard), frontend routing, and UI (hiding nav items). Hiding a nav link is not enough — users can still land on the page via direct URL, back button, or programmatic navigation.
- When a new role is added to a system, audit every route and every query for role compatibility.

---

## 8. Prisma 6 — `findUnique({ where: { id } })` throws "Unique constraint failed" when model has multiple unique fields

**Where:** `quotations.service.ts`, `ai.service.ts`

**Symptom:**
```
Invalid `prisma.quotation.create()` invocation:
Unique constraint failed on the fields: (`quotationNumber`)
```
Creating a quotation failed with a unique constraint error — but the error was misleading. No logs appeared from inside the `create` method, meaning the error happened before it was ever reached.

**Root Cause:**
Prisma 6 changed how `WhereUniqueInput` is generated for models with multiple unique fields. When you call `findUnique({ where: { id } })`, Prisma 6 throws a runtime error because it can't determine which unique constraint you're targeting. The error message it throws ("Unique constraint failed") is confusing because it sounds like a DB-level insert error, not a query input validation error.

This caused `findOwner()` to throw before `create()` was ever called — explaining why no logs appeared inside `create`.

**Fix:**
Replace all `findUnique({ where: { id } })` calls with `findFirst({ where: { id } })` on any model that has multiple unique fields. `findFirst` accepts a plain filter and has no unique-constraint disambiguation requirement:
```ts
// Before — throws in Prisma 6 when model has multiple unique fields
await this.prisma.quotation.findUnique({ where: { id } });

// After
await this.prisma.quotation.findFirst({ where: { id } });
```

**Interview angle:**
- `findUnique` and `findFirst` are not always interchangeable in Prisma 6. `findUnique` enforces that the `where` clause targets exactly one unique constraint — useful for correctness guarantees but breaks when a model has multiple unique fields and you only pass one.
- Misleading error messages are a major debugging trap. "Unique constraint failed" normally means a DB insert/update collision — seeing it on a `findUnique` call is unexpected. Always check stack traces and which line the error originates from, not just the message.
- When no logger output appears before an error, the error is happening upstream of where you're looking — trace the call stack from the resolver down, not from the service up.

---

## 9. Unique constraint violation on `quotationNumber` when creating a quote

**Where:** `backend/src/modules/quotations/quotations.service.ts`, `backend/src/prisma/seed.ts`

**Symptom:**
```
Invalid `prisma.quotation.create()` invocation:
Unique constraint failed on the fields: (`quotationNumber`)
```
Creating a new quotation through the UI fails immediately.

**Root Cause:**
The quotation number generator uses a Postgres sequence (`quote_number_seq`) that starts at 1. The seed script inserts quotations with hardcoded numbers `QT-2026-0010` through `QT-2026-0029` (sequence values 10–29). After seeding, the sequence is still at its last-used value near 1. When a user creates quote #10, the sequence produces `10` → `QT-2026-0010` → collision with the seeded row.

**Fix:**
At the end of the seed script, advance the sequence past all seeded values:
```ts
await prisma.$executeRaw`SELECT setval('quote_number_seq', 100)`;
```

**Interview angle:**
- Sequences and seed data must be coordinated. If seed data uses values 1–29, the sequence must start at 30+. A common pattern is to use `setval` at the end of every seed script.
- `setval(seq, n)` sets the sequence's current value to `n` — the next `nextval` call returns `n+1`. Pass `false` as the third arg (`setval(seq, n, false)`) if you want the next call to return `n` itself.
- This class of bug only appears after seeding — it works fine on a clean DB, then breaks when real users try to create records. Always test the create flow after running seed.

---

## 10. Login succeeds but app stays on login page — `useState` initial value is stale

**Where:** `frontend/src/context/AuthProvider.tsx`, `frontend/src/App.tsx`

**Symptom:**
Login mutation returns the user successfully (confirmed in GraphQL playground), but the UI stays on the login page. No error shown.

**Root Cause:**
Two compounding issues:

1. **`useState` initial value only runs once on mount.** At mount, `user` is `null` (still loading), so `currentPage` always defaulted to `"dashboard"`.

2. **`setUser` didn't actually store the user.** `AuthProvider` derived `user` entirely from `data?.me` (the `ME_QUERY` result). `setUser` only toggled a `loggedOut` boolean — it never stored the login response. So after `onCompleted` called `setUser(data.login)`, the user value in context was still `null` (because `ME_QUERY` cache hadn't been updated), and `!user` remained true, keeping `<LoginPage />` on screen.

**Fix:**
Add a `localUser` state to `AuthProvider` that stores the user set by `setUser` directly:
```ts
const [localUser, setLocalUser] = useState<User | null>(null);

const user = loggedOut ? null : (localUser ?? data?.me ?? null);

const setUser = useCallback((u: User | null) => {
  setLocalUser(u);
  setLoggedOut(u === null);
}, []);
```
Priority order: `loggedOut` wins first, then `localUser` (set by login/logout), then `data?.me` (session rehydration on page refresh).

**Interview angle:**
- `useState(expensiveComputation)` — the initialiser runs **once on mount only**. If the value depends on async data that isn't ready yet (user session, API response), the initial value will be stale. Use `useEffect` or derive state from a single source of truth instead.
- Context `setUser` functions should be self-contained — if the user value comes from `setUser`, store it locally. Don't split the source of truth across local state and a query result without a clear merge strategy.
- The login flow mental model: mutation → `onCompleted` → `setUser(user)` → context updates → re-renders → `!user` is now false → login page unmounts. Every step in that chain must work for navigation to happen.

---

## 11. Shared `loading` flag caused both Approve and Reject buttons to show "Updating…"

**Where:** `frontend/src/pages/QuotationDetailPage.tsx` — `StatusActions` component

**Symptom:**
Clicking "Approve" changed both the Approve and Reject button labels to "Updating…". Only one action was in flight but both buttons reflected the loading state.

**Root Cause:**
A single `loading` boolean from `useMutation` was shared across both buttons. Since `loading` is true for the entire duration of any mutation — regardless of which button triggered it — both buttons read the same flag and rendered the same loading text.

**Fix:**
Replace `loading` with a `pendingAction` state that tracks which specific action is in flight:
```tsx
const [pendingAction, setPendingAction] = useState<string | null>(null);

const act = (newStatus: string) => {
  setPendingAction(newStatus);
  void updateStatus(...);
};
// onCompleted / onError: setPendingAction(null)

// Each button checks its own value:
{pendingAction === "APPROVED" ? "Approving…" : "Approve"}
{pendingAction === "REJECTED" ? "Rejecting…" : "Reject"}
// Both disabled while any action is pending:
disabled={pendingAction !== null}
```

**Interview angle:**
- A single `loading` boolean from a mutation hook is coarse — it covers the whole mutation lifecycle but can't distinguish *which* of multiple buttons triggered it. When multiple actions share one mutation hook, track the in-flight action explicitly with a state variable.
- Both buttons should still be `disabled` while a request is in flight to prevent double submission — only the *label* should be action-specific.

---

## 12. Switched AI provider from Gemini to Groq for reliability

**Where:** `backend/src/modules/ai/ai.service.ts`

**Symptom:**
The AI insight feature returned `503 Service Unavailable` errors from Gemini (`gemini-2.5-flash`) during periods of high demand. The error was transient but frequent enough to break the feature in normal use.

**Root Cause:**
Google's Gemini free tier models experience regular availability spikes, especially on newly released models. The `resolveModel()` method had a fallback that picked the first available model from the API listing — this silently selected `gemini-2.5-flash` (alphabetically first), which turned out to be the most overloaded model.

**Fix:**
Replaced `@google/generative-ai` with `groq-sdk`. Groq runs open-source models (Llama 3.3 70B, Llama 3.1 8B, Mixtral 8x7B) on dedicated inference hardware with significantly better availability on the free tier.

The `callGroq()` method walks through models in preference order and automatically falls over to the next one on any transient error (503, 429, "overloaded"):
```ts
const GROQ_MODELS = [
  'llama-3.3-70b-versatile',  // best quality — try first
  'llama-3.1-8b-instant',     // faster, lighter — fallback
  'mixtral-8x7b-32768',       // wider context — last resort
];
```
Also added stripping of markdown code fences since some models wrap JSON responses in ` ```json ``` ` blocks.

**Interview angle:**
- Free-tier AI APIs are not production-grade for availability. Always build a fallback strategy — either multiple models on the same provider, or multiple providers.
- OpenAI-compatible APIs (Groq, Together AI, Cloudflare AI) are easier to swap between since they share the same request/response shape.
- When an external API is unreliable, the fix is at the infrastructure level (model fallback list), not at the call site (retry loops on the same broken model).
- Self-healing means the system recovers without human intervention — walking a model list on transient errors is more robust than retrying the same overloaded endpoint.

---

## 13. Manager could submit a DRAFT quotation — frontend privilege separation gap

**Where:** `frontend/src/pages/QuotationDetailPage.tsx` — `StatusActions` component

**Symptom:**
A SALES_MANAGER logged in, opened a DRAFT quotation, and could see and click "Submit for Approval". This meant a manager could submit their own quote and then immediately approve it — bypassing the entire review workflow.

**Root Cause:**
The `showSend` condition included `isManager`:
```ts
const showSend = status === "DRAFT" && (isOwner || isManager);
```
The intent was that only the rep who created the draft should submit it.

**Fix:**
Remove `isManager` from the submit condition — only the owner may submit:
```ts
const showSend = status === "DRAFT" && isOwner;
```

**Interview angle:**
- Role-based UI is a layered concern: hide actions the user shouldn't perform (UX), AND block them at the API if they try anyway (security). Frontend hiding alone is not enough.
- Privilege separation in a sales workflow: the person who creates and submits a quote must be different from the person who approves it. Allowing the same person to do both defeats the purpose of the approval step.

---

## 14. Neon free tier cold starts crash the backend — fixed with WebSocket driver

**Where:** `backend/src/prisma/prisma.service.ts`

**Symptom:**
After leaving the app idle for ~1 hour, the backend crashed on startup with:
```
PrismaClientInitializationError: Can't reach database server at ep-xxx.neon.tech:5432
```
Even after adding retry logic with up to 56 seconds of backoff, the backend still crashed because Neon took longer than that to wake up.

**Root Cause:**
Neon free tier pauses compute after 5 minutes of inactivity. The default Prisma setup uses a persistent TCP connection. When Neon pauses, the TCP connection is dropped. On restart, Prisma tries to establish a new TCP connection — but Neon's compute takes 15-30+ seconds to wake up, longer than any reasonable retry window.

The initial fix switched to `PrismaNeonHttp` (stateless HTTP per query), which solved cold starts. It later had to switch again to `PrismaNeon` (WebSocket) because nested Prisma writes use implicit transactions which are not supported in HTTP mode.

**Fix (final):**
Use `PrismaNeon` WebSocket adapter with a 4-minute keepalive ping to prevent Neon from pausing:
```ts
// prisma.service.ts
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString });
const adapter = new PrismaNeon(pool);
super({ adapter });
```

**Additional hardening:**
- `withDbRetry()` helper wraps individual queries with backoff — absorbs the 2-3s first-query delay after a cold start
- Keepalive ping (`SELECT 1` every 4 minutes in `main.ts`) prevents Neon from pausing while the backend is running

**Interview angle:**
- Serverless databases (Neon, PlanetScale, Turso) have a fundamentally different connection model than traditional Postgres. Persistent TCP connections assume the server is always up — HTTP-based drivers make no such assumption.
- For portfolio/demo projects on free-tier serverless DBs, the WebSocket driver with keepalive is the right choice. For production with consistent traffic, a connection pooler like PgBouncer or Neon's built-in pooler is better.
- Keep-alive pings are a pragmatic solution for low-traffic apps. They add a tiny amount of DB load to prevent much more disruptive cold starts for users.

---

## 15. TypeScript errors and test failures only caught in CI — fixed with Husky pre-commit hooks

**Where:** `.husky/pre-commit`, `.husky/pre-push`, root `package.json`

**Symptom:**
TypeScript errors in test files were not caught locally and only surfaced when Vercel ran `npm run build` in the CI/CD pipeline. Similarly, test regressions were only discovered after pushing. This creates a slow feedback loop — push → wait for CI → read logs → fix → push again.

**Root Cause:**
No local quality gate. The Vercel build runs `tsc -b` which compiles the full project including test files, so type errors in `*.test.tsx` files that pass `vitest` (which uses esbuild, not `tsc`) still fail the production build.

**Fix:**
Set up Husky to run quality checks as Git hooks before commits and pushes are allowed through.

**`pre-commit` hook** (runs on every `git commit`, ~30s):
```sh
npm --prefix frontend run build -- --mode development   # TypeScript + Vite build
npm --prefix frontend run test -- --run                 # frontend unit tests
npm --prefix backend test                               # backend unit tests
```

**`pre-push` hook** (runs on `git push`, ~45s):
```sh
npm --prefix backend run test:cov   # with --coverageThreshold statements≥90%
npm --prefix frontend run test -- --run --coverage      # with thresholds statements≥95%
```

**Why E2E tests are not in hooks:**
E2E tests require Docker Desktop running, a fresh DB, migrations, and a seed — total ~3 minutes. They run in GitHub Actions CI on every push to main.

**Interview angle:**
- Git hooks are the cheapest way to shift quality left — failures surface in seconds instead of minutes.
- `set -e` in shell scripts is critical — without it, a failing test would print errors but the hook would exit 0 and let the commit through.
- `tsc -b` and `vitest` use different compilers (TypeScript vs esbuild). Code can pass `vitest` but fail `tsc` — always run the actual build as part of the type check gate.

---

## 16. No observability — added health endpoint, Railway health check, and UptimeRobot alerts

**Where:** `backend/src/main.ts`, Railway dashboard, UptimeRobot

**What was added:**

**`/health` REST endpoint** (`backend/src/main.ts`):
```ts
app.getHttpAdapter().get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
```
A lightweight GET endpoint that returns 200 immediately. Intentionally does not hit the DB — a DB check here would cause false negatives during Neon cold starts.

**Railway health check** (configured in dashboard):
- Path: `/health`, interval: 30s, timeout: 10s
- Railway restarts the container automatically if the endpoint stops responding

**UptimeRobot** (free, external monitoring):
- Monitor 1: `https://api.quoteiq.cc/health` — HTTP GET, 5-min interval
- Monitor 2: `https://quoteiq.cc` — HTTP GET, 5-min interval
- Alert contact: email notification on down + recovery

**Full observability stack for free:**

| What | Tool | Cost |
|---|---|---|
| Downtime alerts | UptimeRobot | Free |
| Container health check + auto-restart | Railway | Free (built-in) |
| CPU / memory / logs | Railway dashboard | Free (built-in) |
| Frontend performance + errors | Vercel Analytics | Free (built-in) |

**Interview angle:**
- Observability has three pillars: logs, metrics, and traces. Railway logs + UptimeRobot uptime + Vercel Analytics covers all three at zero cost.
- External monitoring (UptimeRobot) is always needed alongside platform monitoring (Railway) — the platform cannot alert you if it itself is the thing that went down.
- Health check endpoints should be fast and side-effect free. Hitting the DB in `/health` introduces latency and can cause cascading failures if the DB is slow.

---

## 17. Railway health check failing — CORS blocking server-side probes with no Origin header

**Where:** `backend/src/main.ts` — `app.enableCors()`

**Symptom:**
Railway's health check was configured to hit `/health` every 30 seconds but kept reporting the service as unhealthy even though the app was running and responding to real requests from the browser.

**Root Cause:**
Railway's health checker is a server-side HTTP probe — it sends a plain GET request with no `Origin` header. The original CORS config passed a string array:

```ts
app.enableCors({ origin: allowedOrigins });
```

When `origin` is a string array, NestJS CORS middleware rejects **any request whose `Origin` header is not in the list** — including requests with **no `Origin` header at all**. Railway's probe had no origin, so it received a CORS rejection.

**Fix:**
Switch from a static allowlist to a callback function that explicitly allows origin-less requests:

```ts
app.enableCors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
});
```

**Interview angle:**
- CORS is enforced by browsers, not servers. A `curl` request or a Railway health probe bypasses browser CORS entirely — but NestJS's middleware doesn't know that and applies the rule to all requests anyway.
- Health check endpoints need to be reachable by infrastructure tooling (load balancers, orchestrators, uptime monitors) that never send an `Origin` header. Always test your health endpoint with `curl` before assuming it works.

---

## 18. Missing role-based transition guard — SALES_REP could attempt APPROVED/REJECTED transitions

**Where:** `backend/src/modules/quotations/quotations.service.ts` — `updateStatus()`

**Symptom:**
The state machine (`allowed` map) correctly blocked illegal state transitions. But it only checked *what* state the quotation was in — not *who* was making the transition. A SALES_REP on their own quotation in SENT state could call `updateQuotationStatus` with `APPROVED` and the service would allow it, since SENT → APPROVED is a valid transition in the state machine.

**Fix:**
Added a role check inside `updateStatus()` after the state machine check:

```ts
const managerOnlyTargets: QuotationStatus[] = [
  QuotationStatus.APPROVED,
  QuotationStatus.REJECTED,
];
if (managerOnlyTargets.includes(status) && userRole === Role.SALES_REP) {
  throw new ForbiddenException('Only managers can approve or reject quotations');
}
```

**Interview angle:**
- State machine validity and role-based authorisation are orthogonal concerns. A transition can be structurally valid but role-forbidden. Always model them separately.
- Authorization checks belong in the service layer, not just the resolver/controller. The resolver is the HTTP boundary but the service is the trust boundary.

---

## 19. Prisma `$transaction` not supported by Neon HTTP driver

**Where:** `backend/src/modules/quotations/quotations.service.ts`

**Symptom:**
`updateQuotationStatus` and `createQuotation` mutations failed in production (Neon) with `"Transactions are not supported in HTTP mode"`. The same operations worked fine locally when pointed at a local Docker PostgreSQL.

**Root Cause:**
The Neon HTTP driver (`PrismaNeonHttp`) sends each query as a stateless HTTP request. There is no persistent connection to hold a transaction open across multiple queries — so `$transaction(async tx => { ... })` is fundamentally incompatible with this driver.

**Fix:**
Replaced both `$transaction` usages with sequential Prisma calls. All guards (state machine + role check) run before any write, so a failed validation never leaves partial state.

**Interview angle:**
- Always test with the same driver you deploy with. A local Docker Postgres + TCP driver hides incompatibilities with serverless HTTP drivers that only surface in production.
- HTTP-based database drivers trade transactional guarantees for cold-start resilience. For most OLTP operations, sequential writes with pre-write validation are an acceptable substitute.
- The `$queryRaw` call for `nextval()` is still atomic at the DB level — PostgreSQL sequences are always transactionally safe regardless of how the client connects.

---

## 20. Search input sanitization — frontend maxLength + backend trim/cap

**Where:** `frontend/src/pages/QuotationsPage.tsx`, `backend/src/modules/quotations/quotations.service.ts`

**Fix (two layers — defense in depth):**

Frontend — browser hard-stops at 100 characters:
```tsx
<input maxLength={100} ... />
```

Backend — trim whitespace and cap at 100 chars before Prisma sees it:
```ts
const rawSearch = filter?.search?.trim().slice(0, 100) ?? '';
const searchWhere = rawSearch ? { OR: [...] } : {};
```

**Interview angle:**
- `maxLength` on the input is UX enforcement but not a security boundary — anyone can remove it from DevTools or send a raw GraphQL request.
- The backend trim+cap is the real guard — it applies regardless of how the request was sent.
- Parameterized queries (Prisma, prepared statements) are the definitive protection against SQL injection — input sanitization is a secondary layer for operational efficiency, not a substitute.

---

## 21. Prisma nested `create` uses implicit transaction — not supported by Neon HTTP adapter

**Where:** `backend/src/modules/quotations/quotations.service.ts` — `create()` method

**Symptom:**
"Transactions are not supported in HTTP mode" error when creating a quotation with line items.

**Root Cause:**
Prisma's nested relation write (`quotation.create({ data: { items: { create: [...] } } })`) wraps both the parent and child inserts in an implicit transaction. The `PrismaNeonHttp` adapter does not support transactions at all — not explicit `$transaction()` calls and not the implicit ones Prisma generates for nested writes.

**Three culprits:**
1. Nested relation write in `quotation.create({ data: { items: { create: [...] } } })`
2. `quotationItem.createMany(...)` — Prisma 6 wraps this in a transaction internally
3. `quotation.update({ ..., include: { items, createdBy } })` — `update` with an `include` clause uses an implicit read-your-writes transaction

**Pattern:**
Any Prisma operation that implicitly uses a transaction fails under the Neon HTTP adapter. This includes:
- Nested `create` / `createMany` inside a parent `create` or `update`
- Top-level `createMany` (Prisma 6 wraps it in a transaction internally)
- `update` / `upsert` with an `include` clause
- Explicit `$transaction([...])` calls

Always decompose multi-table writes into sequential single-table operations when using `PrismaNeonHttp`.

---

## 22. NestJS decorator lambdas inflate uncovered-line counts — use `/* istanbul ignore next */`

**Where:** All resolver files — `quotations.resolver.ts`, `auth.resolver.ts`, `ai.resolver.ts`, `dashboard.resolver.ts`, `jwt.strategy.ts`

**Symptom:**
Unit test coverage reported ~80% for resolver files despite every method having a test. Istanbul was counting decorator factory arrow functions (`() => [QuotationType]`, `() => Int`, `() => ID`) as uncovered statements.

**Root Cause:**
NestJS GraphQL decorators accept type-factory lambdas like `@Query(() => [QuotationType])`. These lambdas are invoked by the NestJS GraphQL schema builder at application bootstrap — not during unit test `createTestingModule()` calls. Istanbul counts each lambda as a statement and marks it uncovered.

**Fix:**
Added `/* istanbul ignore next */` immediately before each decorator factory lambda:
```ts
@Args('take', {
  nullable: true,
  type: /* istanbul ignore next */ () => Int,
})
```

**Rule:**
- Only use this for code that genuinely cannot be reached from unit tests. Do not use it to paper over missing test cases.
- E2e tests do invoke these lambdas (full app bootstrap + Apollo schema build), so they are covered in the `test:e2e` run.

---

## 23. Apollo MockedProvider — `refetchQueries` variable mismatch causes test timeout

**Where:** `frontend/src/components/CreateQuotationModal.test.tsx`, `frontend/src/pages/QuotationsPage.test.tsx`

**Symptom:**
Two tests timing out at 5000ms. The `CreateQuotationModal` submit test never called `onCreated`. The `QuotationsPage` loading-state test hung the runner.

**Root Cause:**

1. **`refetchQueries` variable mismatch.** `CreateQuotationModal` called `useMutation` with `refetchQueries: [{ query: QUOTATIONS_QUERY }]` — no `variables` key. Apollo serialises this as `variables: {}`. The test mock was registered with `variables: { filter: undefined }`. MockedProvider treats these as different requests and never resolves the refetch, so `onCompleted` never fires.

2. **Unresolved pending query leaks async work.** The loading-state test rendered the page and made a synchronous assertion, then ended without draining the pending Apollo query. MockedProvider kept the query in-flight, React tried to update state outside `act()`, and Vitest's async cleanup timer fired instead of completing the test normally.

**Fix:**
- Pass explicit variables in `refetchQueries` to match the mock: `{ query: QUOTATIONS_QUERY, variables: { filter: undefined } }`.
- Convert the loading-state test to `async` and add `await screen.findByText(...)` at the end to drain the pending query before the test exits.

**Rule:** When a test renders a component that fires a query, always drain the pending response before the test ends — even if you don't assert on the resolved data — to avoid async-cleanup timeouts.

---

## 24. Feature completeness — backend filters without UI are half-features

**Where:** `QuotationFilterInput.repId`, `QuotationsPage` rep dropdown

**Symptom:**
`repId` filtering was added to the backend `findAll()` but the frontend had no way to send it. From a manager's perspective the feature doesn't exist.

**Fix:**
Add the `salesReps` query to `AuthResolver` (gated to SALES_MANAGER/ADMIN), expose it in the frontend via `SALES_REPS_QUERY`, and render a rep dropdown in `QuotationsPage` that is conditionally shown for managers only.

**Rule:** For every filter or query param added to a backend API, ask: "can the intended user actually invoke this from the UI?" If not, the feature is incomplete. Backend + UI ship together or not at all.

---

## 25. Conversion score — defer to cached InsightType rather than piggybacking on summary

**Where:** `AIService.getConversionScore`, `InsightType.CONVERSION_SCORE`

**Decision: separate query.**
- The score is deterministic (no LLM call) and cheap to compute; it does not need the full summary pipeline.
- The table view needs only the score badge — triggering a full AI summary call for every SENT row in a list would be expensive and slow.
- Separate caching lets the score TTL (24h) work independently of the summary TTL.

**Rule:** When an existing enum/table already carves out a slot for a feature, use it. Don't collapse unrelated concerns into one type just to reduce query count — separate queries with separate caches give better control over cost and freshness.

---

## 26. Test coverage must ship with the feature — not as a follow-up

**Where:** `ai.service.spec.ts`, `auth.service.spec.ts`, `auth.resolver.spec.ts`, `quotations.service.spec.ts`, `QuotationsPage.test.tsx`, `app.e2e-spec.ts`

**Symptom:**
Two complete features (repId filter, conversion score) shipped with zero test coverage. The gap was only caught on a dedicated audit pass after the fact.

**Rule:** Every new service method, resolver query, and UI behaviour needs a test in the same commit. If a test cannot be written (e.g. external API), document why and add a manual test note. "Works in the browser" is not a substitute for a test.

---

## 27. Score threshold boundary must match the code — test with values that actually cross it

**Where:** `ai.service.spec.ts` — `caps score at 30 when rejection rate exceeds 60%`

**Symptom:**
Test used 3 rejected out of 5 (60% rejection rate). Code uses `rejectionRate > 0.6` (strictly greater than). 60% does NOT trigger the cap, so the test failed with received score 58, expected ≤ 30.

**Fix:**
Changed to 4 rejected out of 5 (80% rejection rate) — clearly above the threshold.

**Rule:** When testing a numeric threshold, always read the operator in the code (`>` vs `>=`) and pick a test value that is unambiguously on the intended side of the boundary.

---

## 28. StatusHistory was already populated — surfacing it required no migration

**Where:** Feature — Status history timeline

**What happened:**
The `StatusHistory` table was already being written by `updateStatus()` on every status transition. The data was there; it just had no query endpoint and no UI. Adding the feature was purely additive: new `StatusHistoryType` entity, `findStatusHistory()` service method, `statusHistory` GraphQL query, and `StatusTimeline` component.

**Rule:** Before designing a new data model, check whether the data already exists in the DB. Read the schema before assuming a migration is needed.

---

## 29. MockedProvider requires every query a component fires — including nested ones

**Where:** `QuotationDetailPage.test.tsx` — `StatusTimeline` renders inside the same provider

**What happened:**
`StatusTimeline` fires `STATUS_HISTORY_QUERY` as soon as it mounts. Existing tests that only mocked `QUOTATION_QUERY` would have generated "No more mocked responses" warnings and left the query in-flight, causing async cleanup noise.

**Fix:**
Added `emptyHistoryMock` (returning `[]`) into the shared `makeMock()` helper so every test that renders `QuotationDetailPage` also satisfies the history query.

**Rule:** When a page component renders sub-components that fire their own queries, the test's `MockedProvider` must cover all of them — not just the top-level query.

---

## 30. Edit modal reuses create form — prop-driven mode switch keeps logic co-located

**Where:** Feature — Edit quotation (`CreateQuotationModal.tsx`)

**Design decision:**
Rather than a separate `EditQuotationModal`, an optional `quotation` prop drives mode. When present: pre-populates state, calls `updateQuotation` mutation, shows "Save Changes" / "Edit Quotation" labels. When absent: original create flow unchanged.

**Rule:** Before creating a new form component, check whether an existing one can be parameterised. A boolean/prop mode switch is acceptable when the two modes share >80% of their logic.

---

## 31. Win/loss analysis: deterministic aggregation cached in AIInsight, quotationId set to null

**Where:** Feature — Win/loss analysis (`ai.service.ts`, `AIInsight` table)

**What happened:**
The `AIInsight` table has a unique index on `(quotationId, insightType)`. Win/loss analysis is a portfolio-level metric — it has no single quotationId. Passing `null` directly caused a TypeScript compile error.

**Fix:**
Used `null as unknown as string` when upserting the win/loss cache. The DB constraint accepts NULL and the Prisma unique index handles the `(null, WIN_LOSS_ANALYSIS)` pair correctly.

**Follow-up (entry 32):** Prisma 6 validates compound unique key upserts at runtime and rejects null — replaced upsert with `findFirst` + conditional `create`/`update`.

---

## 32. Prisma upsert rejects null in compound unique key at runtime — use findFirst + create/update

**Where:** `AIService.getWinLossAnalysis()` — caching win/loss in AIInsight with quotationId = null

**What happened:**
`null as unknown as string` satisfied TypeScript but Prisma 6 validates the `where` clause at runtime and throws: `Argument quotationId must not be null`. The `quotationId_insightType` compound unique index cannot be used for lookups when `quotationId` is null.

**Fix:**
Replaced `upsert` with `findFirst` + conditional `create`/`update` — first to check the warm cache (with `expiresAt > now`), second before persisting to find any existing stale row.

**Rule:** Never use Prisma compound unique key upserts when any field in the key can be null. Use `findFirst` + conditional `create`/`update` instead. The type cast `null as unknown as T` is a red flag — if you need the cast, the upsert approach won't work at runtime.

---

## 33. Use system/user message split to scope LLM answers — not a blocklist or regex

**Where:** `AIService.askAboutQuotation()` — natural language Q&A on quotation detail

**Design decision:**
Initial design considered a blocklist/regex filter on the user's question to prevent off-topic queries. This is fragile — you can't enumerate every off-topic question, and adversarial users can rephrase to bypass patterns.

**Chosen approach:**
The quotation context is embedded in the **system prompt**; the user's question is passed as the **user message**. The system prompt instructs Groq to answer only questions about the provided quotation data and to respond with a fixed refusal for anything unrelated.

**Rule:** For scoped LLM assistants, use the system/user message split as the access control boundary. Put trusted context (data, constraints, persona) in the system prompt; put untrusted user input in the user message.

---

## 34. Invalidate derived cache when source data changes — don't wait for TTL expiry

**Where:** `QuotationsService.update()` → `AIInsight` cache for `SUMMARY` and `CONVERSION_SCORE`

**What happened:**
AI insights are cached for 24h. But if a manager edits a DRAFT quotation (title, line items, notes, tax rate), the cached insight is immediately stale — it reflects the old version of the deal.

**Fix:**
After a successful `quotation.update`, call `aIInsight.deleteMany({ where: { quotationId } })`. The next time a manager generates an insight, it hits a clean cache and calls Groq with the current data.

**Rule:** Cache invalidation must be tied to mutation of the source data, not just TTL. TTL is a safety net for stale reads when no explicit invalidation happens — it is not a substitute for invalidating on write.

---

## 35. Prisma `groupBy` return type cannot be directly cast with `as T[]`

**Where:** `backend/src/modules/ai/ai.service.ts` — `getWinLossAnalysis`

**What happened:**
Replaced in-memory `findMany` aggregation with `groupBy` SQL calls. Used `as StatusRow[]` directly on the `groupBy` result, which TypeScript rejected — Prisma infers `groupBy` return as an intersection of the input shape and the result rows, so a direct array cast conflicts.

**Fix:**
Separate the call from the cast: `const raw = await prisma.quotation.groupBy(...)`, then `const typed = raw as unknown as StatusRow[]`. The `unknown` intermediate breaks the intersection inference and allows the explicit type assertion.

**Rule:** When asserting Prisma `groupBy` or `$queryRaw` results to a custom type, always cast through `unknown` first.

---

## 36. Apollo `MockedProvider` matches on exact variables — adding new query variables breaks all existing mocks

**Where:** `frontend/src/pages/QuotationsPage.test.tsx`

**What happened:**
Added `take` and `skip` variables to `QUOTATIONS_QUERY` for pagination. Every existing mock had `variables: { filter: undefined }`. Apollo's `MockLink` does a deep-equal match — the new variables `{ take: 20, skip: 0, filter: undefined }` no longer matched any mock, so all tests received no data and `findByText` timed out.

**Fix:**
Update every `MockedResponse` in the test file to include the new variables. Use `replace_all` in editor tooling to catch all occurrences at once.

**Rule:** When you change query variables in a GQL document, immediately grep the test files for that query name and update all mock `variables` objects. Variable shape changes are a silent breakage — no TypeScript error, just runtime mock misses.

---

## 37. NestJS guard execution order: `APP_GUARD` runs before resolver-level guards

**Where:** `backend/src/app.module.ts` — `ThrottlerGuard` registered via `APP_GUARD` provider

**What happened:**
When `ThrottlerGuard` is registered as an `APP_GUARD` in the providers array and `JwtAuthGuard` is applied at the resolver level via `@UseGuards`, the execution order is: `ThrottlerGuard` first, then `JwtAuthGuard`. A rate-limited request gets a 429 before authentication is even attempted.

**Why this is correct:**
You want to throttle before doing any auth work (JWT decode + DB lookup for the user). Letting unauthenticated clients hit the rate limit is intentional — it means a brute-force attacker gets throttled without burning DB connections.

**Rule:** `APP_GUARD` providers execute in registration order, before any guard applied with `@UseGuards` at the class or method level. Design guard chains with this ordering in mind: throttle → authenticate → authorize.

---

## 38. Apollo Client `fetchMore` + `updateQuery` deprecated — use field policies

**Where:** `frontend/src/lib/apollo.ts`, `frontend/src/pages/QuotationsPage.tsx`

**What happened:**
Used `updateQuery` callback in `fetchMore` to manually merge the next page of quotations. This works but `updateQuery` is deprecated in Apollo Client 3+ in favour of `InMemoryCache` field policies. On refetch (e.g. after a mutation), only page 1 is shown — the merged pages revert.

**Fix:**
Define a `keyArgs` + `merge` field policy on `quotations` in `InMemoryCache`:
```ts
new InMemoryCache({
  typePolicies: {
    Query: {
      fields: {
        quotations: {
          keyArgs: ['filter'],
          merge(existing = [], incoming) {
            return [...existing, ...incoming];
          },
        },
      },
    },
  },
})
```
With this in place, `fetchMore` automatically merges pages without a manual `updateQuery` callback.

**Rule:** `keyArgs` must NOT include pagination variables (`take`/`skip`) — only the variables that identify a distinct list. Including pagination args would create a separate cache entry per page instead of merging into one.

---

## 39. NestJS `RolesGuard`: silent `return false` masks misconfiguration — throw explicit exceptions

**Where:** `backend/src/common/guards/roles.guard.ts`

**What happened:**
`RolesGuard.canActivate()` returned `false` when no `@Roles()` decorator was found. This caused two silent failure modes: (1) any route protected only by `RolesGuard` without a `@Roles()` decorator would deny all traffic with no log or HTTP error body; (2) when the JWT user was `undefined`, `user?.role` returned `undefined`, which `required.includes(undefined)` silently rejected.

**Fix:**
- Throw `ForbiddenException('No roles configured for this endpoint')` when `required` is null — surfaces misconfiguration immediately
- Throw `UnauthorizedException()` when `user` is undefined — correct HTTP 401 semantics
- Throw `ForbiddenException()` when role check fails — 403 not 401

**Rule:** Guards that silently deny are harder to debug than guards that throw named exceptions. Reserve `return false` for cases where the guard is legitimately optional. For role-enforcement guards, always throw.

---

## 40. GraphQL `@Query` vs `@Mutation` convention — LLM calls must be Mutations

**Where:** `backend/src/modules/ai/ai.resolver.ts` — `askAboutQuotation`

**What happened:**
`askAboutQuotation` was declared as `@Query` even though it calls Groq (external I/O, non-idempotent, has side effects via DB cache). GraphQL spec says Queries are safe (idempotent, no side effects) — clients and proxies may batch or cache them. Mutations are not.

**Fix:**
Changed decorator to `@Mutation`. Updated frontend from `useLazyQuery` + `ASK_ABOUT_QUOTATION_QUERY` to `useMutation` + `ASK_ABOUT_QUOTATION_MUTATION`. Updated test mocks accordingly.

**Rule:** Any operation that calls an external API, writes to a cache, or has observable side effects must be a Mutation — regardless of whether it "feels" like a read.

---

## 41. Exposing full `UserType` in `salesReps` leaks email (PII) — use a projection type

**Where:** `backend/src/modules/auth/auth.resolver.ts` — `salesReps` query

**What happened:**
`salesReps` returned `[UserType]`, which includes `email`. The frontend only needs `id` and `name` for the rep filter dropdown — email was never requested in the query fragment, but it was present in the schema and could be added by any client.

**Fix:**
Added `SalesRepSummaryType { id name }` to `user.entity.ts`. Changed `salesReps` service method to `select: { id: true, name: true }` so Prisma only fetches those columns. Resolver return type updated to `[SalesRepSummaryType]`.

**Rule:** Schema-level exposure is the attack surface, not query-level fragments. If a field shouldn't be readable, remove it from the return type — don't rely on clients not asking for it.

---

## 42. `repId` input validation: static method on InputType keeps validation co-located with the type

**Where:** `backend/src/modules/quotations/dto/quotation.input.ts`

**What happened:**
`repId` in `QuotationFilterInput` was passed directly to `prisma.quotation.findMany({ where: { createdById: filter.repId } })` without format validation. Any string would be accepted and used in the Prisma query.

**Fix:**
Added `static validateRepId(repId)` on `QuotationFilterInput` with a UUID regex. Called from `QuotationsService.findAll` before any DB work. Updated service spec to use real UUIDs in repId tests and added a test for the rejection case.

**Rule:** For ID inputs that drive `WHERE` clauses, validate format at the service boundary before the query runs. A static method on the InputType class keeps the validation co-located with the type definition.

---

## 43. react-router-dom: replace stateful string routing with URL-based routes

**Where:** `frontend/src/App.tsx`, `frontend/src/components/Layout.tsx`

**What happened:**
The app used `useState("dashboard")` to track the current page and `switch(currentPage)` to render. Back button was broken (browser back didn't navigate within the app), URLs were not bookmarkable, and deep-linking to a quotation detail was impossible.

**Fix:**
Installed `react-router-dom` v7. Wrapped `App` in `<BrowserRouter>`. Routes: `/`, `/dashboard`, `/quotations`, `/quotations/:id`, `/winloss`. `QuotationDetailPage` receives `id` from `useParams`. Navigation via `useNavigate`. `Layout` sidebar uses `<NavLink>` for automatic active-state styling. `DefaultRedirect` sends users to the correct landing page based on role.

**Rule:** Stateful string routing is a red flag in any app that has more than one page. URL-based routing makes every view bookmarkable, shareable, and testable — and it's what interviewers check for.

---

## 44. Frontend-only validation is not enough — backend must re-sanitize free-text inputs

**Where:** `backend/src/modules/quotations/quotations.service.ts` — `create()` method

**What happened:**
After replacing the `clientId` FK with a free-text `clientName` field, the frontend applied `stripTags` + 200-char trim via React `onChange` handlers. The backend accepted `clientName` from the GraphQL resolver with zero validation — any caller bypassing the React UI could store raw HTML or unbounded strings directly in the database.

**Fix:**
```ts
const clientName = input.clientName.replace(/<[^>]*>/g, '').trim();
if (!clientName || clientName.length > 200) {
  throw new BadRequestException('clientName must be between 1 and 200 characters');
}
```

**Rule:** Validate and sanitize at the API boundary (service layer), not only in the UI. Frontend guards are UX affordances; backend guards are the actual security boundary.

---

## 45. Apollo cache not invalidated after delete — list required a hard refresh

**Where:** `frontend/src/pages/QuotationDetailPage.tsx` — `deleteQuotation` useMutation

**Symptom:**
After successfully deleting a draft quotation, the app navigated back to the quotations list, but the deleted item was still visible in the table. A hard refresh made it disappear.

**Root Cause:**
Apollo's normalized cache still held the deleted quotation entry. The `deleteQuotation` mutation returned a boolean (`true`), not the deleted object — so Apollo had no automatic way to know which cache entry to evict.

**Fix:**
Add `refetchQueries` to the mutation options:
```ts
const [deleteQuotation] = useMutation(DELETE_QUOTATION_MUTATION, {
  refetchQueries: [{ query: QUOTATIONS_QUERY }],
  onCompleted: () => onDeleted(),
});
```

**Rule:** Mutations that delete or create records must either update the Apollo cache directly (`update` option) or trigger a re-fetch (`refetchQueries`). Always test the list view after a create/delete mutation.

---

## 46. Removing the Client model — manual migration on a drifted Neon DB and cascade of test updates

**Where:** `backend/prisma/schema.prisma`, backend modules, frontend pages and tests

**Decision:**
The `Client` model was a standalone entity with its own CRUD. Replaced `clientId FK` on `Quotation` with a `clientName: String` free-text field.

**Problem — `prisma migrate dev` blocked by schema drift:**
The Neon DB had drifted from the migration history (a previous manual SQL patch). Running `migrate dev` would have reset the DB, wiping production data.

**Fix:**
Wrote a raw SQL migration manually:
```sql
ALTER TABLE "Quotation" ADD COLUMN "clientName" TEXT NOT NULL DEFAULT '';
UPDATE "Quotation" q SET "clientName" = c."name" FROM "Client" c WHERE q."clientId" = c."id";
ALTER TABLE "Quotation" DROP CONSTRAINT IF EXISTS "Quotation_clientId_fkey";
ALTER TABLE "Quotation" DROP COLUMN IF EXISTS "clientId";
DROP TABLE IF EXISTS "Client";
```
Created the migration directory manually, ran the SQL via a temporary `tsx` script, then registered it with `prisma migrate resolve --applied`.

**Interview angle:**
- `prisma migrate resolve --applied` is the escape hatch for registering a manually applied migration without resetting data. Use it when drift makes `migrate dev` unsafe.
- `NOT NULL DEFAULT ''` + backfill UPDATE is the standard pattern for adding a non-nullable column to a live table.
- The TS language server lags after `prisma generate` — always validate with `tsc --noEmit` before concluding there is a real error.

---

## 47. `type="number"` inputs — `e` key, locale decimal separator, and default values

**Where:** `frontend/src/components/CreateQuotationModal.tsx`

**Symptom 1 — exponential notation accepted:**
Price and quantity fields were `type="number"`. HTML number inputs silently accept `e`/`E` as part of scientific notation (e.g. `1e2` = 100).

**Fix:** Add `onKeyDown={(e) => { if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault(); }}` to all numeric inputs.

**Symptom 2 — decimal separator shows `.` in EU locale:**
`type="number"` always renders a `.` as decimal separator. In German/EU locale, users expect `,` — a user typing `1,5` produces an empty/invalid value.

**Fix:** Switch quantity and price inputs to `type="text" inputMode="decimal"`. Before submitting, parse with `parseFloat(value.replace(",", "."))`.

**Symptom 3 — hardcoded tax rate default:**
`useState("19")` pre-filled the tax rate as 19% (Germany's VAT rate) — inappropriate for an international portfolio app.

**Fix:** Change to `useState("0")`.

**Rule:** Never trust `type="number"` to enforce input shape — it allows scientific notation and ignores locale. Use `type="text" inputMode="decimal"` for currency/quantity fields and parse manually.

---

## 48. Integer-only qty input, notes XSS guard, and `min` attribute affecting jsdom test behaviour

**Where:** `frontend/src/components/CreateQuotationModal.tsx`

**Symptom 1 — qty accepted letters and decimals:**
Switch to `type="number" inputMode="numeric" step="1" min="1"` and add `onKeyDown` blocking `e`, `E`, `+`, `-`, `.`, `,`. Parse with `parseInt` at submit time.

**Symptom 2 — notes accepted HTML tags:**
Strip HTML tags on `onChange` with `replace(/<[^>]*>/g, "")`. Add `maxLength={500}` and a live `{count}/{max}` counter.

**Symptom 3 — test for "quantity zero" broke after adding `min="1"`:**
In jsdom, a `type="number"` input with `min="1"` treats `0` as out-of-range and returns `""` from `e.target.value` — so `parseInt("", 10)` is `NaN`, and `NaN <= 0` is `false`, so the validation never fired.

**Fix:** Changed condition from `parseInt(v) <= 0` to `!isNaN(n) && n >= 1` so an empty/NaN qty also triggers the error. Changed test to clear the qty field entirely (empty string) instead of typing `"0"`.

**Rule:** `type="number"` with `min` rejects out-of-range values by returning `""`, not the typed value — always guard against `NaN` explicitly.

---

## 49. Delete draft quotation — ownership enforcement and confirmation UX

**Where:** `backend/src/modules/quotations/quotations.service.ts`, `frontend/src/pages/QuotationDetailPage.tsx`

**Problem:**
A `deleteQuotation` mutation existed but had the wrong access control — restricted to SALES_MANAGER/ADMIN via `RolesGuard`. Sales reps (the creators) couldn't delete their own drafts, and managers who shouldn't touch other people's quotes could.

**Rules implemented:**
1. Status must be `DRAFT` — `BadRequestException` for anything else
2. `createdById === currentUser.id` — `ForbiddenException` if not the creator
3. No role can override rule 2

**UI:** Delete button only rendered when `status === "DRAFT" && isOwner`. Two-step confirmation inline (no modal): "Delete Draft" → confirmation box with "Yes, delete" / "Cancel".

**Rule:** Ownership checks belong in the service, not just the resolver. Always check role guards aren't accidentally inverting access.

---

## 50. Prisma 6 — `findUnique` in JwtStrategy caused ALL mutations to fail silently

**Where:** `backend/src/modules/auth/jwt.strategy.ts`

**Symptom:**
Every mutation (e.g. `createQuotation`) failed with "Unique constraint failed on the fields: (`quotationNumber`)". No logs appeared from inside the resolver or service.

**Root Cause:**
`JwtStrategy.validate()` runs on every authenticated request — before the resolver method body executes. It contained:
```ts
const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
```
The `User` model has both `id` (`@id`) and `email` (`@unique`). In Prisma 6, `findUnique` on a model with multiple unique fields throws a runtime error when only one field is passed.

Because the guard threw before any resolver code ran, no custom logs appeared, making it look like the resolver was being skipped entirely.

**Fix:**
```ts
const user = await this.prisma.user.findFirst({ where: { id: payload.sub } });
```

**Interview angle:**
- Infrastructure code (guards, interceptors, middleware) runs on every request. A crash there looks like a crash in the resolver — all requests fail, no custom logs appear. Always check guards first when nothing logs.
- Prisma 6's misleading error messages: "Unique constraint failed" can be thrown during query input validation, not just during DB insert.

---

## 51. `secure: true` cookie silently dropped on localhost (HTTP) — all requests return 401

**Where:** `backend/src/modules/auth/auth.service.ts`

**Symptom:**
Login succeeded (the mutation returned a user), but every subsequent authenticated request returned `401 UNAUTHENTICATED`. Incognito mode always failed immediately after login.

**Root Cause:**
The JWT was stored as an `HttpOnly` cookie with `secure: true, sameSite: 'none'`. The `secure` flag tells the browser to only store and transmit the cookie over HTTPS. On `http://localhost` (plain HTTP in development), the browser silently drops the cookie — it is never stored.

**Fix:**
Gate the cookie flags on `NODE_ENV`:
```ts
const isProd = process.env.NODE_ENV === 'production';
res.cookie('access_token', token, {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  maxAge: maxAge,
});
```

**Interview angle:**
- `secure: true` is a browser enforcement, not a server enforcement. On HTTP the browser silently discards the cookie — no error, no warning.
- `sameSite: 'none'` requires `secure: true` by spec (RFC 6265bis). Browsers reject `sameSite=None` without `Secure`.
- Incognito mode is the best tool for testing auth flows — it starts with zero cookies and forces the full login→session cycle every time.

---

## 52. `VITE_API_URL` in `.env.local` pointed to production — all local backend changes had zero effect

**Where:** `frontend/.env.local`

**Symptom:**
Every backend fix had no effect. Errors persisted unchanged. No debug logs appeared in the local backend terminal despite the browser actively making requests.

**Root Cause:**
`frontend/.env.local` contained `VITE_API_URL="https://api.quoteiq.cc/graphql"` — pointing to the **production backend**, not the local server. The browser was never touching `localhost:5000` at all.

`.env.local` had been created by the Vercel CLI which wrote the production API URL into it. Since `.env.local` takes precedence over `.env` in Vite, it silently overrode any local config.

**Rule:**
- When local backend changes have no effect, always verify which server the frontend is actually talking to. Check the Network tab → Request URL on any API call.
- Vite env precedence: `.env.local` > `.env.development` > `.env`. A `.env.local` generated by a deployment tool will silently override your local settings.
- Always confirm the request URL in DevTools before debugging backend code.

---

## 53. Consistent input sanitization across all user-facing text fields

**Where:** `frontend/src/components/CreateQuotationModal.tsx`

**Problem:**
Tag-stripping and character limits were applied to notes but not to title or line item description. No cap existed on the number of line items a user could add.

**Fixes applied:**
- **Title**: `stripTags` on `onChange` + `maxLength={100}` + live `{n}/100` counter
- **Line item description**: `stripTags` on `onChange` + `maxLength={200}`
- **Unit price**: `type="number" inputMode="decimal" step="0.01"` + `onKeyDown` blocks `e E + -`
- **Line items**: cap at 10 items; `addItem` is a no-op when at limit; "+ Add item" button gets `disabled`

**Rule:** Apply the same sanitization policy consistently to every free-text field. Bound all collection inputs (line items, tags, attachments) with a hard maximum and disable the "add" control at the limit.

---

## 54. `test:e2e` script without dotenv wrote data to production Neon DB

**Where:** `backend/package.json` — `test:e2e` script

**Symptom:**
E2e test quotations appeared in the production UI list. Running `npm run test:e2e` locally created and left real records in the production Neon database.

**Root Cause:**
`test:e2e` was defined as `jest --config ./test/jest-e2e.json --forceExit` — no env file was loaded. Jest picked up `.env` (the production Neon `DATABASE_URL`) instead of `.env.test` (which points to `localhost:5433` / Docker Postgres).

**Fix:**
Prefix the script with `dotenv -e .env.test --`:
```json
"test:e2e": "dotenv -e .env.test -- jest --config ./test/jest-e2e.json --forceExit"
```

`dotenv-cli` does not override existing env vars, so GitHub Actions CI (which passes `DATABASE_URL` via the `env:` block) continues using the Docker Postgres container provided by the workflow — not the `.env.test` file.

**Rule:** The `test:e2e` and `test:e2e:local` scripts must load the same test env file. E2e teardown that can fail leaves test data permanently — design teardown so each test creates and cleans up its own isolated data.

---

## 55. `ThrottlerGuard` as `APP_GUARD` crashes on GraphQL requests — `req.ip` is undefined

**Where:** `backend/src/app.module.ts`, `backend/src/common/guards/gql-throttler.guard.ts`

**Symptom:**
Login (and all other GraphQL operations) failed with `TypeError: Cannot read properties of undefined (reading 'ip')` thrown inside `ThrottlerGuard.getTracker`.

**Root Cause:**
`ThrottlerGuard` reads the request via `context.switchToHttp().getRequest()`. For REST routes this returns the Express `Request` object. For GraphQL resolvers, `switchToHttp()` returns an empty adapter — the request lives instead in the GraphQL execution context at `GqlExecutionContext.create(context).getContext().req`. The throttler never saw a real request, so `req.ip` was `undefined`.

**Fix:**
Subclass `ThrottlerGuard` and override `getRequestResponse` to extract from the GraphQL context:
```ts
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext) {
    const gqlCtx = GqlExecutionContext.create(context);
    const ctx = gqlCtx.getContext<{ req: Request; res: unknown }>();
    if (!ctx?.req) return super.getRequestResponse(context);
    return { req: ctx.req, res: ctx.res };
  }
}
```
Register `GqlThrottlerGuard` instead of `ThrottlerGuard` as the `APP_GUARD`. The `if (!ctx?.req)` fallback keeps HTTP routes (health check) working.

**Interview angle:**
- NestJS execution context adapters (`switchToHttp`, `switchToRpc`, `switchToWs`) only work for the transport they're named after. Guards used as `APP_GUARD` run on every transport — always override context extraction when mixing REST and GraphQL.
- `GqlExecutionContext.create(context)` is idempotent and safe to call even on a non-GraphQL context; it simply won't have a meaningful `getContext()` result.

---

## 56. Stale Apollo cache causes previous user's data to flash after switching accounts

**Where:** `frontend/src/components/Layout.tsx`, `frontend/src/pages/LoginPage.tsx`

**Symptom:**
After logging out as a manager and logging in as a sales rep, the dashboard briefly showed the manager's data (or zeros from a failed fetch) before the correct view appeared.

**Root Cause:**
Two race conditions compounded each other:

1. **Logout order:** `setUser(null)` was called before `client.clearStore()`. React re-rendered immediately on state change, so components briefly unmounted/remounted while the old user's data was still in cache.

2. **Login with stale cache:** `ME_QUERY` uses `cache-and-network` — on login, Apollo served the previous user's cached `me` response first, then the network response arrived. `setUser(data.login)` updated auth state but didn't clear the cache, so other queries (dashboard stats, quotations) still returned the prior user's cached results during that window.

**Fix:**
Use `client.resetStore()` (clears cache + refetches active queries) and call `setUser` only in `.finally()` so auth state updates after the cache is clean:

```ts
// Logout
void client.resetStore().finally(() => setUser(null));

// Login
void client.resetStore().finally(() => setUser(data.login));
```

**Why `resetStore` not `clearStore`:**
`clearStore` evicts cached data but does not refetch active queries — components that are already mounted keep their stale data until they happen to re-query. `resetStore` both evicts and triggers refetches, so the new user's queries run with a clean slate before the UI transitions.

**Interview angle:**
- Apollo cache is global and survives across login/logout unless explicitly cleared. Any multi-user flow (account switching, impersonation, shared device) must reset the store on session change.
- `cache-and-network` serves cached data first — helpful for perceived performance, dangerous for user-switching because it means the wrong user's data is served for the duration of the network round trip.
- Always sequence: clear cache → update auth state. Reversing the order causes a render with mismatched data.

---

## 57. Status history section invisible on new and sent quotes — missing creation history entry

**Where:** `backend/src/modules/quotations/quotations.service.ts`, `frontend/src/pages/QuotationDetailPage.tsx`

**Symptom:**
The "Status History" timeline never appeared on DRAFT quotations, and also didn't appear on a quote that had just been submitted for approval (SENT). Users had no idea when the section would show up.

**Root Cause:**
History entries were only written in `updateStatus()` — so the first entry was created on the first transition (DRAFT → SENT). But:
1. A fresh DRAFT had zero entries → timeline returned `null`.
2. A quote submitted for approval: the DRAFT → SENT entry existed in the DB, but the `STATUS_HISTORY_QUERY` result wasn't being refetched after `updateStatus` completed (only `QUOTATION_QUERY` was refetched via `refetch()`). The cache still held the empty array from the initial load.

**Fix:**
Write a `DRAFT → DRAFT` history entry at quotation creation time so the timeline always has at least one entry:
```ts
await this.prisma.statusHistory.create({
  data: { quotationId: created.id, fromStatus: 'DRAFT', toStatus: 'DRAFT', changedById: user.id },
});
```
On the frontend, render the `DRAFT → DRAFT` entry as "Created" rather than the confusing "Draft → Draft" label.

**Rule:** Any UI section that conditionally hides based on empty data should always have at least a seed record — otherwise users can't tell whether the feature exists or is broken. Audit history, timelines, and activity logs should always show something from the moment the entity is created.

---

## 58. `neonConfig.webSocketConstructor` not set — Neon WebSocket fails in Node.js with "fetch failed"

**Where:** `backend/src/prisma/prisma.service.ts`

**Symptom:**
Production login (and all other DB queries) failed with:
```
All attempts to open a WebSocket to connect to the database failed.
Details: TypeError: fetch failed
```

**Root Cause:**
`@neondatabase/serverless` uses native `WebSocket` in browsers. In Node.js there is no global `WebSocket`, so the package falls back to trying `fetch` to bootstrap the connection — which also fails in Node.js without additional configuration. The fix is to set `neonConfig.webSocketConstructor` to the `ws` package before any query runs.

`ws` was already a declared dependency but was never wired into `neonConfig`. The factory-style `new PrismaNeon({ connectionString })` creates the Pool internally, so there is no explicit Pool construction where `ws` could be passed in — it must be set globally via `neonConfig`.

**Fix:**
```ts
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;
```
Set this at module load time in `prisma.service.ts`, before the `PrismaService` constructor runs.

**Interview angle:**
- `@neondatabase/serverless` is a dual-environment package (browser + Node.js). In browsers it uses native WebSocket; in Node.js it must be told which WebSocket implementation to use. This is documented in the package README but easy to miss when switching from explicit `Pool` construction (where `ws` was configured on the pool) to the factory-style adapter (where the pool is created internally).
- "fetch failed" inside a WebSocket error is a misleading message — it's not an HTTP fetch issue, it's the package's fallback path failing because no WebSocket constructor was available.
- Always test the DB connection path in a Node.js environment identical to production. The fact that it works locally (where a Docker Postgres TCP driver is used) can mask missing WebSocket configuration that only surfaces on Neon in production.

---

## 59. SonarCloud: composite React key with changing data causes unmount/remount on every keystroke

**Where:** `frontend/src/components/CreateQuotationModal.tsx`

**Symptom:**
After changing the line-item `key` from `key={idx}` to `key={\`item-${idx}-${item.description}\`}` to satisfy SonarCloud's "Do not use Array index in keys" rule, the description input lost focus after every character typed — only the first character was captured before jsdom/React unmounted and remounted the row.

**Root Cause:**
React uses the `key` prop to decide whether to reuse or recreate a DOM node. When `item.description` is part of the key, every keystroke produces a new `key` string → React unmounts the old `<div>` and mounts a new one → the controlled `<input>` inside it is recreated → focus is lost and only the first character survives.

**Fix:**
Use a stable index-only key (`key={\`item-${idx}\`}`) with a NOSONAR suppression comment. The index-as-key warning is correct for *sorted or reordered* lists, but this is an append/remove-only list where index stability is guaranteed and the alternative (description-based key) causes active breakage.

**Rule of thumb:**
A composite key that includes mutable controlled-input state will cause re-mount on every change. Only include values that are stable for the lifetime of the row (e.g. server-assigned IDs, not user-typed content).

**Interview angle:**
- Key reconciliation is a pure React concern — jsdom has no role, but the bug reproduces in tests because the test types into a real React tree with controlled inputs.
- SonarCloud rules are heuristics; apply engineering judgment. "Array index in keys" is correct 90% of the time but wrong when the list is append-only and items have no stable ID.
