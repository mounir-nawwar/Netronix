# Test manifest — the 14 critical flows

Netronix has fourteen flows whose failure would be expensive: money, stock,
credentials, and the pages a visitor actually sees. Each one has coverage in two
halves.

| Kind | What it asserts | State today |
|---|---|---|
| **Characterisation** | What the system does **right now**, defects included | Active — must pass on every commit |
| **Target state** | The fixed invariant and regression boundary | Active — must pass on every commit |

A characterisation test that documents a defect names the finding and says
"will change". When the fix lands, the diff between the two halves *is* the
behavioural change: visible, reviewable, and intentional.

The two remaining skips are explicitly deferred Phase 5 behaviour. Historical
finding comments remain above active target-state tests to explain why each
regression exists; they no longer imply that the test is skipped.

Run them:

```bash
cd backend  && npm test      # node + supertest + in-memory MongoDB replica set
cd frontend && npm test      # jsdom + Testing Library + MSW
cd admin    && npm test      # jsdom + Testing Library + MSW
```

---

## The fourteen flows

| # | Flow | Finding | Characterisation (active) | Target state (active) | Required at |
|---|---|---|---|---|---|
| 1 | **Order total is server-computed** | SEC-002 | ✅ **flipped** — `backend/test/characterisation/order.test.js` → "a guest order for a $999 product persists at the server-computed total" | ✅ **active** — `backend/test/target-state/api.target.test.js` → "GATE 1 — ignores the client amount and persists the server-computed total" | **Gate 1 — PASS** · Phase 1, tasks 1.7 + 1.8 |
| 2 | **Admin token carries no secret** | SEC-001 | ✅ **flipped** — `backend/test/characterisation/auth.test.js` → "the admin token payload is a claims object with no credential in it" | ✅ **active** — `api.target.test.js` → "GATE 1 — issues a claims object containing no substring of the admin password"; `test/security/auth-boundaries.test.js` → the full matrix | **Gate 1 — PASS** · Phase 1, task 1.5 |
| 3 | **Concurrent orders don't oversell** | DB-001, BE-006 | ✅ **flipped** — `backend/test/characterisation/order.test.js` → "refuses an order that exceeds available stock" · "a variant-less product now decrements" | ✅ **active** — `api.target.test.js` → "N concurrent orders against N-1 stock leave stock at zero, never negative" · "never lets the typed variant quantity go negative under the same race" · "rolls back every decrement when any line in an order fails" · "decrements stock for a product that has no variants"; `data-integrity/gate2.test.js` → "releases the counter, the cart and the order together with the inventory" | **Gate 2 — PASS** · Phase 2, task 2.4 |
| 4 | **Order numbers are unique** | DB-002 | `backend/test/characterisation/order.test.js` → "allocates the first order number as 1000 and increments from the maximum" | ✅ **active** — `api.target.test.js` → "50 concurrent orders receive 50 distinct order numbers" · "enforces uniqueness at the database level"; `gate2.test.js` → "the order-number index is unique, and the database enforces it"; `migrations/migrations.test.js` → 7 counter and de-duplication tests | **Gate 2 — PASS** · Phase 2, task 2.3 |
| 5 | **Logout clears everything** | FE-002, SEC-022 | ✅ **flipped** — `shop-context.test.jsx` → "provides setCartItems to the consumers that destructure it" · "clears the token, the cart, the wishlist and the guest cart, and throws nothing" · "PlaceOrder clears the cart directly, with no typeof guard" | ✅ **active** — `frontend.target.test.jsx` → "exposes a single logout() that clears the cart, the token and storage" · "provides setCartItems to consumers that already destructure it" | **Gate 3 — PASS** · Phase 3, task 3.2 |
| 6 | **Cart quantity round-trips** | BE-004, DB-011 | ✅ **flipped** — `cart.test.js` → "adding quantity 3 stores 3" · "sums repeated adds and refuses to exceed stock" · "quantity 0 deletes the key rather than zeroing it" · "an update that exceeds stock is refused and changes nothing" | ✅ **active** — `api.target.test.js` → "adding quantity 3 makes the server cart read 3" · "refuses to put more in the cart than exists in stock" · "prunes a cart entry when its quantity reaches zero" | **Gate 2 — PASS** · Phase 2, task 2.8 |
| 7 | **Chat output is sanitised** | SEC-004 | ✅ **flipped** — `chat-interface.test.jsx` → "a reply containing `<img onerror>` renders as text, not as an element" · "an anchor in a reply is not rendered as a live link" | ✅ **active** — `frontend.target.test.jsx` → "renders markup in a reply as visible text"; `api.target.test.js` → "GATE 1 — never returns HTML in a chatbot reply"; `backend/test/security/chatbot.test.js` → 24 parser assertions | **Gate 1 — PASS** · Phase 1, task 1.3 |
| 8 | **Variant keys survive hyphens** | DB-003, ARCH-002, ARCH-003 | ✅ **flipped** — `product.test.js` → "reports fresh inventory through check-inventory, in both representations"; the four pure-function tests are kept, because they characterise the *legacy encoder* that `legacyKey` still reproduces | ✅ **active** — `api.target.test.js` → "resolves stock for a \"16-inch\" option in both directions" · "never lets two distinct combinations resolve to the same identity"; `migrations.test.js` → "resolves \"RTX-4090\" in both directions" · "reports an ambiguous legacy key and refuses to claim its quantity"; `seed.test.js` → "resolves the hyphenated seeded options in both directions"; **both clients** → `src/test/lib/shared-helpers.contract.test.js`; `admin-consumers.test.jsx` → "labels a hyphenated combination by its axes, not by the raw key" | **Gate 2 — PASS** · Phase 2, task 2.9 |
| 9 | **Catalog fetched once** | FE-001, PERF-005 | ✅ **flipped** — `shop-context.test.jsx` → "a provider issues exactly one GET /api/product/list and one tags request" · "only main.jsx mounts a provider, and it is inside BrowserRouter" · "routes every request through the API layer" | ✅ **active** — `frontend.target.test.jsx` → "issues exactly one GET /api/product/list for the whole application"; `homepage-seeded.test.jsx` → "no homepage section issues a catalog request of its own"; **browser** → `e2e/storefront.spec.js` → "loads the catalog exactly once per page load" | **Gate 3 — PASS** · Phase 3, tasks 3.1 and 3.8 |
| 10 | **Order history is immutable** | DB-005, BE-002, FE-017, DB-012 | ✅ **flipped** — `order.test.js` → "an order line stores a full snapshot of what was bought" · "shows the price and name paid, not the ones in the catalog today" · "survives the product being deleted outright" · "the admin listing reads the same snapshot, with no per-line lookup" | ✅ **active** — `api.target.test.js` → "shows the price paid, not the price today" · "survives the product being deleted" · "returns the original order when a request is replayed with the same idempotency key"; `gate2.test.js` → 9 idempotency tests and "listing 50 snapshot orders issues no product query at all"; `orders-snapshot.test.jsx` → 5 storefront tests including the "Reconstructed" flag | **Gate 2 — PASS** · Phase 2, task 2.2 |
| 11 | **Collections shows expensive products** | FE-003 | ✅ **flipped** — `collections.test.jsx` → "shows a $50, a $500 and a $2,500 product at /collections/all" · "derives the price ceiling from the catalog" · "matches a tag case-insensitively" · "orders newest by the numeric date" | ✅ **active** — `frontend.target.test.jsx` → "shows a $2,500 laptop at /collections/all" · "filters a typed collection by tag rather than by a non-existent category field"; `test/lib/catalog.test.js` → 30 pure-function tests; **browser** → `e2e/storefront.spec.js` → flow 4 | **Gate 3 — PASS** · Phase 3, tasks 3.4 and 3.5 |
| 12 | **Auth boundaries hold** | SEC-001, SEC-003 | ✅ **flipped** — `auth.test.js` → the boundary blocks now assert 401/403 instead of HTTP 200 | ✅ **active** — `api.target.test.js` → expiry · revocation · role-based authorisation; `test/security/auth-boundaries.test.js` → **all 15 guarded routes × 8 rejection modes**, with the route list checked against the router stack | **Gate 1 — PASS** · Phase 1, tasks 1.5 and 1.6 |
| 13 | **Rate limits engage** | SEC-005, SEC-011, SEC-023 | ✅ **flipped** — `auth.test.js` → "20 consecutive failed logins are cut off at the 6th with 429" · rate-limit headers present | ✅ **active** — `api.target.test.js` → all four thresholds; `backend/test/security/rate-limit.test.js` → "GATE 1 — 20 rapid login attempts produce 429" | **Gate 1 — PASS** · Phase 1, task 1.1 |
| 14 | **NoSQL operators rejected** | SEC-006, BE-003 | ✅ **flipped** — `auth.test.js` → "an operator object is rejected with 400 before any query runs" · "a missing password is a 400, not a TypeError" | ✅ **active** — `api.target.test.js` → "GATE 1 — rejects an operator object in the login email with 400"; `backend/test/security/validation.test.js` → six operator shapes × two endpoints | **Gate 1 — PASS** · Phase 1, task 1.4 |

---

## A note on flows 3 and 4

Both are concurrency invariants, and both were covered **only** by skipped
target-state tests until Phase 2.

That was deliberate. Reproducing a lost update or a duplicate order number
*before* the fix means winning a race, and a test that has to win a race to fail
is a test that will also fail at random once the race is fixed. The invariant was
therefore stated once, in the target-state test, where it becomes deterministic
the moment transactions and an atomic counter exist. Both are now **active and
passing**, and both were mandatory at Gate 2.

**One change to the Phase 0 text, and it is not a weakening.** Both tests now
drive `POST /api/order/place` rather than the guest endpoint. Phase 1 capped
guest checkout at **3 orders per hour per IP** (SEC-005/SEC-011) because it is
unauthenticated and inventory-mutating, and that limiter is untouched — flow 13
still asserts that the fourth guest order in an hour is a 429. Ten and fifty
concurrent *guest* orders are simply not a reachable state in this system, so a
test that made them reachable would have been measuring a limiter it had first
had to defeat. Every assertion in both tests is the Phase 0 text verbatim; only
the endpoint moved, and the reason is written out above them in the file.

---

## Coverage beyond the fourteen

The suites also carry material that is not one of the fourteen flows but is
worth pinning before anything moves:

| Area | File | What it locks down |
|---|---|---|
| Application startup | `backend/test/smoke/app-import.test.js` | Importing `app.js` opens no port, no database connection and no timer; the router stack is unchanged; the chat-session cleanup sweep is started only by `server.js`, is idempotent, and stops cleanly |
| Configuration | `backend/test/config/env.test.js` | Missing and invalid variables, weak `JWT_SECRET` handling per environment, and the guarantee that no secret value appears in an error or a log line |
| Database connection | `backend/test/config/mongodb.test.js` | A configured URI reaches Mongoose exactly as written, with nothing appended after its query string — checked for both a `replicaSet` host URI and an SRV URI |
| Client configuration | `frontend/src/test/config.test.js`, `admin/src/test/config.test.js` | A missing `VITE_BACKEND_URL` fails with a named variable; no server-only value can be carried into a browser bundle |
| Storefront pagination | `frontend/src/test/correctness/catalog-pagination.test.jsx` | The bounded catalog walk — page ordering, the `maxPages` bound, an envelope carrying no paging fields at all, metadata that goes stale mid-walk, and a truncated catalog surfaced as an error rather than as a ready state |
| Seed guards | `backend/test/scripts/seedSafety.test.js` | Every production-looking target the seed must refuse — Atlas, SRV, remote hosts, credentials, and non-disposable database names |
| Seed data | `backend/test/scripts/seed.test.js` | Determinism, idempotency, `--reset`, showcase-driven homepage assignments, and the variant/stock coverage the other suites rely on |
| API envelopes | `backend/test/characterisation/product.test.js` | Response shapes, tag and best-seller filtering, and generic invalid-identifier errors that never expose a `CastError` |
| Admin console | `admin/src/test/characterisation/admin-auth.test.jsx` | Login round-trip, console gating, and that no admin credential is ever bundled |
| Admin session ordering | `admin/src/test/correctness/admin-session-race.test.jsx` | A verification result that arrives after logout, or after a newer verification was issued, can neither reopen the console nor destroy a session that is still good |
| Seeded homepage | `frontend/src/test/characterisation/homepage-seeded.test.jsx` | Showcase-driven homepage sections resolve against the seeded catalog and remain safe when a showcase slot is empty |
| **Migration safety** | `backend/test/migrations/safety.test.js` | 25 refused targets — SRV, Atlas, DocumentDB, Cosmos, DigitalOcean, Render, Railway, an arbitrary remote host, a public IP, a mixed multi-host URI, credentials, `e-commerce`, `admin`, `netronix_production`, and the `dev`/`demo` names the **seed** accepts but a migration must not — plus 6 accepted ones, the guarantee that no environment variable can authorise anything, and the absence of a CLI entry point |
| **Migrations** | `backend/test/migrations/migrations.test.js` | Every migration's `up()` and its `down()` against a pre-Phase-2 fixture, the whole sequence round-tripped to byte-identical documents, index inspection with `explain()`, and the reports for ambiguous variant keys, duplicate order numbers, malformed prices, malformed ids and coerced statuses |
| **Gate 2 data integrity** | `backend/test/data-integrity/gate2.test.js` | Transaction rollback of counter/cart/order/stock together, nine idempotency tests, archive and restore semantics, referential integrity, the complete status transition table, schema-level refusals, money exactness and dual-read, N+1 absence measured through Mongoose's debug hook, index existence, and pagination across every list endpoint |
| **Shared helper contract** | `frontend/src/test/lib/shared-helpers.contract.test.js`, `admin/src/test/lib/…` | The mirrored `lib/money.js` and `lib/variant.js` are compared **byte for byte** with the backend originals, and the same table of money and variant cases is run in all three applications |
| **Client money and variant consumers** | `admin/src/test/characterisation/admin-consumers.test.jsx`, `frontend/src/test/characterisation/orders-snapshot.test.jsx` | Hyphenated combinations label and round-trip through the console, `Intl` formatting replaces concatenation, and an order written **before** the migration still renders in both clients |

---

## Current cumulative pre-commit status

| Package | Active (passing) | Skipped (later phase) | Files |
|---|---|---|---|
| `backend` | 1,081 | 0 | 37 |
| `frontend` | 371 | 0 | 29 |
| `admin` | 144 | 2 | 11 |
| **Total** | **1,596** | **2** | **77** |

Measured on 2026-08-21. The `backend` and `admin` rows are whole-suite runs
(`npm test` in each package). The `frontend` row is the collected test count
across its 29 files, which carry no skips; its most recent whole-suite pass is
the 365/365 recorded at the Phase 4 checkpoint, since when only
`catalog-pagination.test.jsx` and `shop-context.test.jsx` have changed and both
were re-run green. No number in this table is carried forward from a phase
document without being re-measured.

Plus the browser end-to-end suite in `frontend/e2e/`, counted separately
because it is a different kind of evidence — see below.

Phase 0 ended at 282 active and 60 skipped across 18 files; Phase 1 at 700 and
35 across 25; Phase 2 at 960 and 20 across 32; Phase 3 at 1,399 and 6 across 60.
Phase 4 activated **all four of its remaining skips** — BE-014, A11Y-001,
ADM-012/A11Y-002 and TEST-002 — leaving only the two that belong to Phase 5.

### What Phase 4 added

| Suite | Covers |
|---|---|
| `frontend/src/test/performance/spline-removal.test.jsx` | PERF-001, PERF-006, PERF-008, FE-026 — no `@splinetool` dependency, import, viewer script or `scene.splinecode` anywhere; `motion` and `react-hot-toast` gone and the libraries that *are* used still present; **and the hero iframe still renders**, titled, with the React `frameBorder` spelling |
| `frontend/src/test/performance/render-efficiency.test.jsx` | PERF-007, FE-015, FE-022, FE-023 — sixty rAF frames produce exactly one scroll listener and one live loop, the transform is written directly rather than through state, listeners are removed on unmount, twenty scroll events re-subscribe nothing, and the context value and its callbacks survive a consumer re-render by identity |
| `frontend/src/test/a11y/reduced-motion.test.jsx` | A11Y-001 — the stylesheet block, `MotionConfig reducedMotion="user"`, and per-surface behaviour: static hero with **no iframe created**, marquee classes dropped, no rAF loop and no scroll listener for the scrolling text, and a film with no `<source>` attached and `play()` never called |
| `frontend/src/test/a11y/dialogs-and-semantics.test.jsx` | A11Y-002, A11Y-004, A11Y-005, A11Y-008, A11Y-009 — landmarks, the skip link as the first tab stop, focus trap and restoration for the search overlay and the chat, `role="log"` on the transcript, the payment radios driven by arrow keys, no nested interactive elements, and no unnamed button on the shell |
| `frontend/src/test/seo/metadata.test.jsx` | SEO-001…SEO-005 — static defaults, a real 1200×630 OG image checked at the PNG header, per-route titles/descriptions/canonicals, `noindex` on private routes, `Product`+`Offer` built from catalog data only, **a test that fails if any route ever emits `AggregateRating`, `reviewCount` or an address**, robots and sitemap generation, and head cleanup that never touches a tag it did not create |
| `admin/src/test/a11y/admin-dialogs.test.jsx` | ADM-012, A11Y-002 — focus into both modals, twelve tabs that cannot leave them, Escape, focus restored to the exact row button, and uniquely named row actions |
| `backend/test/observability/health.test.js` | BE-014 — 200 when the ping succeeds against the real in-memory replica set; 503 when disconnected, when the ping rejects, and when it hangs; a fixed body vocabulary with no connection string, host, driver message or version |
| `backend/test/observability/logging.test.js` | BE-011, SEC-016, DEVOPS-005 — redaction asserted against **real serialised pino bytes** (top-level, nested, and every non-glob path driven with a canary value), the correlation id on every line, the query string never logged, `/health` not logged, no token in any output during a real login, and telemetry that is disabled without a DSN, scrubs its payloads, and adds no Sentry dependency |

### What Phase 3 added

| Suite | Covers |
|---|---|
| `backend/test/correctness/chat-sessions.test.js` | BE-001, DEVOPS-001 — a session continues in a process that never opened it (the serverless cold-start case), the TTL index, deterministic refusal of a stale session, bounded history, and that only the *parsed* reply is stored |
| `backend/test/correctness/cart-merge.test.js` | FE-009 — summing both carts, capping at real stock through the Phase 2 variant resolver, keeping an unresolvable line as intent, and rejecting a malformed or oversized payload without writing anything |
| `backend/test/correctness/admin-product.test.js` | ADM-002, ADM-004 — partial update semantics, image-slot retention, matrix reconciliation, order history left untouched, the auth boundary, and nine combinations saved atomically |
| `backend/test/migrations/migrations.test.js` (+5) | FE-004 — `008_showcase` up/down, the enum the schema enforces, and the deliberate refusal to guess an assignment |
| `frontend/src/test/lib/catalog.test.js` | FE-003, FE-010 — the filter and sort rules as pure functions, including the derived price ceiling |
| `frontend/src/test/api/client.test.js` | FE-006, BE-009, SEC-010 — the pagination envelope normalised identically from three shapes, and errors a person can read |
| `frontend/src/test/correctness/product-card.test.jsx` | FE-007, TEST-005 — every presentation mode, image scrubbing and touch swipe, missing-image handling, and that one card implementation remains |
| `frontend/src/test/correctness/routes-and-states.test.jsx` | FE-020, FE-021 — 404, the `/orders` guard and where it returns to, guest checkout staying public, and the error boundary |
| `admin/src/test/correctness/product-form.test.jsx` | ADM-005, ADM-002 — the derived matrix **under `<StrictMode>`**, immutable handlers, pruning, and the form shared by Add and Edit |
| `admin/src/test/correctness/product-list.test.jsx` | ADM-003, ADM-004 — one atomic inventory request, the confirmation dialog, the archived filter and restore, and the absence of any one-click delete |

### Browser end-to-end tests

```bash
cd frontend && npm run test:e2e        # playwright test
```

`frontend/e2e/` drives a real Chromium against the real storefront, the real
admin console and the real API, over a **seeded in-memory MongoDB** that the test
process creates and destroys (`backend/scripts/e2eEnv.js`). Ports are allocated
at run time; no external service is contacted; no OpenAI key or Cloudinary
account is configured, so the chat takes its structured offline path.

Phase 4 added three specs, all of them things only a browser can answer:

| Spec | Covers |
|---|---|
| `e2e/accessibility.spec.js` | `@axe-core/playwright` on home, a seeded product, cart, checkout, the open chat and the admin list with its inventory dialog open — **zero critical or serious violations**; a keyboard-only browse → product → variant → cart → **checkout complete** journey with no `click()` in it at all; focus traps and focus restoration for the chat, the search overlay and the admin dialog; and the skip link |
| `e2e/reduced-motion.spec.js` | `emulateMedia({ reducedMotion: 'reduce' })` on each named surface — the Spline scene is **never requested**, the marquee and the scrolling text are measurably still (two computed transforms a second apart), and the film neither autoplays nor fetches a byte — plus the mirror image without the preference, where every one of them still runs |
| `e2e/metadata.spec.js` | The emitted head in a real DOM: seven distinct route titles, canonicals, the OG image fetched and checked at the PNG header for 1200×630, `Product`+`Offer` on a seeded product, `noindex` on the private routes and the 404, and `robots.txt` served |

These are counted apart from the unit and component suites on purpose. An
end-to-end claim is only worth what the browser actually did, and relabelling
component tests as E2E is the specific dishonesty the verification plan warns
about.

### Remaining skips — both Phase 5

| Skipped | Finding | Phase |
|---|---|---|
| `admin/src/test/target-state/admin.target.test.jsx` ×2 | ADM-007 / PORT-003 ("Under Development" pages), ADM-008 (decorative controls) | 5 |

Activated in Phase 4: BE-014 (`api.target.test.js`), A11Y-001
(`frontend.target.test.jsx`), ADM-012 / A11Y-002 and TEST-002
(`admin.target.test.jsx`). Each carries a comment saying what activated it and
where the behaviour it stands in for is asserted in full.

Each still records its finding id, its reason and the task that enables it.
There are no unexplained skips and no TODOs.

The backend's public `test/security/` directory carries the following
verification suites:

| File | Covers |
|---|---|
| `security/rate-limit.test.js` | SEC-005, SEC-011, SEC-023 — all four thresholds |
| `security/headers.test.js` | SEC-013, DEVOPS-004 — helmet, CSP, body limit, CORS |
| `security/chatbot.test.js` | SEC-004 — the marker parser and the HTTP contract |
| `security/validation.test.js` | SEC-006, SEC-017–019, ADM-009 — plus an **endpoint coverage table** asserted against Express's router stack |
| `security/auth-boundaries.test.js` | SEC-001, SEC-003, SEC-012, SEC-020 — **15 guarded routes × 8 rejection modes**, with the route list asserted against the router stack |
| `security/errors.test.js` | SEC-009, SEC-010, SEC-014, SEC-016 |
| `security/upload.test.js` | SEC-008, ADM-013 |

Two of those files carry a coverage assertion rather than a behavioural one:
the guarded-route list and the endpoint list are both checked against Express's
own routing table, so a route added later without a boundary test or without
validation fails the suite instead of shipping unnoticed.
