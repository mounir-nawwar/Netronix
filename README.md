# Netronix

A full-stack e-commerce platform for a Lebanon-based computer and gaming
hardware retailer: variant-level inventory, dual guest and authenticated carts,
a catalog-grounded AI support agent, an admin analytics dashboard, and a
hand-built interactive storefront.

**Netronix began as a second-year Software Engineering project.** It is now
being incrementally modernised — audited, tested, and repaired in dependency
order, without a rewrite. This README describes the project as it actually is
today, including what does not work yet.

> **Not production-ready.** Phases 1, 2 and 3 closed the security,
> data-integrity and correctness findings listed below, but known
> **presentation and honesty** defects remain — see
> [Known limitations](#known-limitations). There is still no payment system,
> and nothing here has been run against a real deployment.

---

## Architecture

Three independent npm projects, each deployed separately. There is no workspace
tooling and no shared package; each is installed and run on its own.

```
repo/
├── backend/     Express + Mongoose REST API (Node, ESM)
├── frontend/    Customer storefront — React 18 + Vite + Tailwind
└── admin/       Admin console — React 19 + Vite + Tailwind + Recharts
```

| | Storefront | Admin console | API |
|---|---|---|---|
| Dev port | 5173 | 5174 | 4000 |
| Talks to | the API | the API | MongoDB, Cloudinary, OpenAI |

The API exposes 33 routes under `/api/{user,product,cart,order,chatbot}`.
Both clients authenticate by sending a JWT in a `token` header.

Phase 3 added three: `POST /api/cart/merge` hands a guest cart over at sign-in,
`PATCH /api/product/:id` edits a product without destroying it, and
`POST /api/product/:id/inventory` saves a whole variant matrix in one atomic
write.

Every list endpoint takes bounded `page` and `limit` and answers with an
envelope: `{ success, products | orders, items, total, page, pages, limit }`.
The array keeps the name the deployed clients already read. The storefront's API
client normalises the envelope centrally now, reading `items` where it is present
and the named array where it is not, so both shapes resolve identically — but the
named fields are still written, because dropping them needs a full release of
dual-reading first.
`POST /api/order/{place,guest/place}` accept an optional `Idempotency-Key`
header; a replay returns the original order rather than creating a second one.

`backend/app.js` builds and exports the Express application with no startup side
effects; `backend/server.js` is the only file that validates configuration,
connects to MongoDB, and opens a listening socket. That split is what lets the
test suite drive the API in-process.

---

## Data model

Five application models back five collections: users, products, orders, chat
sessions and counters. Migration runs additionally use an append-only
`migrationJournal` collection for rollback ownership and review reports.
Everything Phase 2 added is **additive**: no field was dropped, and a document
written before the migrations still loads.

### Money

Every monetary value is stored twice, on purpose.

| Field | Type | Role |
|---|---|---|
| `priceMinor`, `amountMinor`, `subtotalMinor`, `deliveryFeeMinor`, `unitPriceMinor`, `lineTotalMinor` | integer | **Canonical.** A whole number of cents. All arithmetic happens here. |
| `price`, `amount`, `subtotal`, `delivery_fee`, `unitPrice`, `lineTotal` | float | Compatibility. Written from the integer, never computed independently. |
| `currency` | string | ISO 4217. Always `USD` — this is not multi-currency support and there is no exchange rate anywhere. |

Floats do not survive addition: `0.1 + 0.2` is `0.30000000000000004`, and the
storefront used to accumulate a cart total across an unbounded number of lines
before the server wrote it down verbatim. Formatting happens once, at the
presentation edge, through `Intl.NumberFormat` — never by concatenating a symbol
onto a number.

### Variants

A product's purchasable combinations live in `inventoryV2`:

```js
inventoryV2: [{
  variantId:  "Size=16-inch;Storage=1TB",      // canonical, escaped, order-independent
  legacyKey:  "16-inch-1TB",                   // the old hyphen-joined string
  options:    { Size: "16-inch", Storage: "1TB" },   // the identity
  quantity:   1,                               // integer, min 0, enforced by the schema
  sku:        undefined,
}]
```

`options` is the truth. `variantId` is its string form and is what queries and
comparisons use. `legacyKey` exists only so a client, a cart or an order line
written against the previous contract still resolves during the rollout — it can
collide, and when it does the resolver **refuses** rather than guessing.

The old encoding was `optionValues.join('-')`, recovered with `key.split('-')`,
and nothing ever checked an option value for a hyphen. In a computer-hardware
catalog that breaks immediately: `16-inch`, `RTX-4090`, `Wi-Fi 6E`, `USB-C`. The
legacy `inventory` object is still written and still kept in step.

### Orders

An order line is a **snapshot** taken at purchase time — name, variant identity,
unit price, quantity, image, line total — so order history is a record of what
was bought rather than a view of today's catalog. Orders also carry
`statusHistory: [{ status, at, by }]`, and status changes follow a transition
table: fulfilment moves forward only, `Cancelled` is reachable from any
non-terminal stage, and `Delivered`/`Cancelled` are terminal. A disallowed move
is a 409 and leaves the order exactly as it was.

Order numbers come from an atomic counter inside the order's own transaction,
with a unique index behind them.

`archived: true` on a product hides it from every catalog surface and leaves
order history intact — which is what makes soft delete the correct default. A
hard delete is refused while any order references the product.

---

## Migrations

```
backend/migrations/
├── safety.js      the target guard — every rule fails closed
├── runner.js      applies one or many, keeps a ledger and an audit report
├── index.js       the list, in dependency order
├── journal.js     append-only ownership/report evidence written before changes
└── 001…008_*.js   each with up(), down(), its findings, and its rollback caveats
```

> **Executing a migration is authorised only against an ephemeral loopback
> MongoDB created by the test process.** There is deliberately **no CLI** in this
> directory, and nothing in it reads `MONGODB_URI` or any other environment
> variable — a target has to be stated by whoever is accountable for it.

The guard refuses `mongodb+srv://` outright, refuses every non-loopback host by
name or as unknown, refuses any URI carrying credentials, and requires a database
name containing `test` or `scratch`. It is deliberately stricter than the seed's,
which also accepts `dev`, `local` and `demo`: a seed writes known fixtures into a
disposable database, a migration transforms whatever is already there. See
`backend/test/migrations/safety.test.js`.

Every migration has a `down()` and every `down()` is tested: each builds a
pre-Phase-2 fixture, runs `up()`, asserts what changed, runs `down()`, and
asserts the fixture is back. The whole sequence is round-tripped end to end to
byte-identical documents.

**What they will not do.** Where a transformation has no algorithmic answer, the
migration reports it instead of guessing:

| Situation | What happens |
|---|---|
| Two combinations produce the same legacy key (`16-inch` × `1TB` and `16` × `inch-1TB`) | Both entries are written `needsReview: true` with **no quantity claimed**; the legacy number is left untouched for a human |
| An inventory key no combination generates | Reported as an orphan and left in place |
| Two orders holding the same number | The oldest keeps it; the rest are reassigned deterministically and the old → new mapping is recorded, because a customer may hold the old one |
| A price that is not a finite, non-negative, in-range number | Reported; no `priceMinor` is written, because a wrong price persisted is worse than a missing one |
| An id that is not a valid ObjectId | Reported and left as it is, never deleted |
| A status outside the enum | Coerced to `Order Placed` and reported, with the original recorded so it is reversible |

**Historical prices are not recoverable.** They were never stored — that absence
*is* the defect being fixed. Migration `002` reconstructs each pre-existing order
line from the catalog as it stands at migration time and stamps it
`_reconstructed: true`; the storefront renders those lines with a
**Reconstructed** badge. Orders placed after the migration are exact.

**Before running any of this against a real database**, an accountable operator
must supply and review a cutover plan: take a `mongodump`, restore it into a
scratch database, run and inspect every migration report there, verify rollback,
diff the result, define the maintenance window and abort criteria, and only then
authorise the real target. No such procedure or backup was supplied or attempted
here, because no real database exists in this repository.

---

## Local setup

Requires **Node 22** (see `.nvmrc`) and MongoDB running as a **replica set or
through mongos**. A standalone `mongod` is not sufficient: core order, inventory
and deletion writes use transactions and will fail without transaction support.

For a safe loopback-only local replica set with Docker:

```bash
docker volume create netronix-mongo-data
docker run --name netronix-mongo --detach \
  --publish 127.0.0.1:27017:27017 \
  --volume netronix-mongo-data:/data/db \
  mongo:8 --replSet netronix-rs --bind_ip_all

# Run after the container reports ready (retry the ping until it succeeds).
docker exec netronix-mongo mongosh --quiet --eval 'db.adminCommand({ ping: 1 })'
docker exec netronix-mongo mongosh --quiet --eval \
  'rs.initiate({_id:"netronix-rs",members:[{_id:0,host:"localhost:27017"}]})'
```

Set the complete application URI, including its database name and replica-set
option. `MONGODB_URI` is passed to the driver unchanged; both `mongodb://` and
`mongodb+srv://` URIs may carry normal query options:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/e-commerce?replicaSet=netronix-rs
```

```bash
nvm use                                   # Node 22

cd backend  && npm install && cd ..
cd frontend && npm install && cd ..
cd admin    && npm install && cd ..
```

Copy each environment template and fill it in:

```bash
cp backend/.env.example  backend/.env
cp frontend/.env.example frontend/.env
cp admin/.env.example    admin/.env
```

Every variable is documented in the template it lives in, including which are
server-only and which are compiled into a browser bundle. The backend validates
its configuration at boot and refuses to start with a list of what is missing or
malformed — it never prints a value.

Generate a real `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Then seed a demo database (see [Seeding](#seeding-demo-data)) and run all three:

```bash
cd backend  && npm run server     # http://localhost:4000
cd frontend && npm run dev        # http://localhost:5173
cd admin    && npm run dev        # http://localhost:5174
```

---

## Seeding demo data

A fresh database produces a complete homepage. Each demo product declares which
homepage surface it belongs to and where in it:

```js
showcase: [{ slot: 'featured', order: 0 }, { slot: 'shop-the-look', order: 1 }]
```

The storefront selects by that field, so the homepage follows the catalog rather
than a list of ids compiled into the bundle. Until Phase 3 it did the opposite —
five components named their products by literal ObjectId, and the seed adopted
those exact ids as a documented transitional shim. Both are gone.

```bash
cd backend
npm run seed -- --uri=mongodb://127.0.0.1:27017/netronix_dev
```

It writes 20 products, one demo customer, and ten orders spanning every order
status, guest and authenticated. The catalog deliberately includes variant-less,
single-axis and multi-axis products, hyphenated option values such as `16-inch`
and `RTX-4090`, and zero-stock, single-unit and normally stocked combinations —
so the awkward paths are reachable from a seeded database rather than only in
theory.

Normal runs are **idempotent**: every document is written by `_id` with fixed
content, so running the seed twice leaves the database in the same state, and
running it again restores anything that was edited by hand.

```bash
npm run seed -- --uri=... --reset          # destructive; asks for confirmation
npm run seed -- --uri=... --reset --yes    # destructive; no prompt
```

Demo customer: `demo@netronix.test` / `NetronixDemo123!`.

**No admin user is seeded**, deliberately: a seeded administrator is a published
credential, since the seed's output is fixed and reproducible. Create one
against a local database instead:

```bash
npm run create-admin -- --uri=mongodb://127.0.0.1:27017/netronix_dev --email=you@example.test
```

It prompts for the password without echoing it, refuses to accept one as a
command-line argument (argv is visible to other processes and lands in shell
history), and inherits every one of the seed's target guards.

### Seed safety

The seed writes and, with `--reset`, deletes. Every guard fails closed:

- The target must be **supplied explicitly**, via `--uri=` or
  `SEED_MONGODB_URI`. `MONGODB_URI` is deliberately never consulted, so the seed
  cannot inherit the database the application runs against.
- **No `mongodb+srv://`** — the SRV form resolves to hosts that cannot be
  checked, and is the standard form for hosted clusters such as Atlas.
- **Loopback hosts only.** Managed-hosting domains (Atlas, DocumentDB, Cosmos,
  DigitalOcean, Railway, Render) are refused by name; every other non-loopback
  host is refused as unknown. In a multi-host URI, every host must pass.
- **No credentials** in the URI unless `--allow-credentials` is passed, and even
  then every other guard still applies.
- The **database name must contain** `test`, `local`, `dev` or `demo`. The
  application's own database name is excluded by that rule.
- `--reset` requires a typed confirmation, or `--yes` stated explicitly. It
  refuses outright when stdin is not interactive.
- Only the products, users and orders collections are ever touched.
- Only the host and database name are printed. Credentials never reach stdout or
  an error message.

These guards have their own test suite: `backend/test/scripts/seedSafety.test.js`.

---

## Tests

```bash
cd backend  && npm test        # node + supertest + in-memory MongoDB replica set
cd frontend && npm test        # jsdom + Testing Library + MSW
cd admin    && npm test        # jsdom + Testing Library + MSW
cd frontend && npm run test:e2e   # Playwright + Chromium, against a seeded stack
```

Also available in each package: `npm run test:watch` and `npm run test:coverage`.

No test contacts a real service. The backend suite starts a single-node MongoDB
replica set in memory, applies the migrations to it, and destroys it afterwards;
both browser suites intercept at the network boundary with MSW, configured so
that any unhandled request fails the test rather than escaping.

That in-memory replica set is the **only** database any migration is ever
executed against — see [Migrations](#migrations).

Tests began in two complementary groups, and the distinction still matters:

- **Characterisation tests** record observed behaviour and protect intentional
  compatibility contracts.
- **Target-state tests** state the repaired behaviour required by a finding and
  become active when that repair lands. At the accepted Phase 4 checkpoint,
  every Phase 1–4 target-state test is active; only the two explicitly documented
  Phase 5 presentation tests remain skipped.

[`docs/test-manifest.md`](docs/test-manifest.md) maps the fourteen critical
flows to both halves. At the current cumulative pre-commit checkpoint there are
**1,596 active tests and 2 skipped** across 77 files, and both remaining skips
are Phase 5. The manifest records when each package's figure was last measured
and by which run; nothing there is carried forward unverified.

### End-to-end tests

```bash
cd frontend && npm run test:e2e     # Playwright + Chromium
```

Browser tests drive the real storefront and the real admin console against the
real API, over a **seeded in-memory MongoDB** the test process creates and
destroys (`backend/scripts/e2eEnv.js`). Ports are allocated at run time, no
external service is contacted, and no OpenAI key or Cloudinary account is
configured — so the chat exercises its structured offline path.

Phase 4 added three specs to the seventeen flow tests: `accessibility.spec.js`
(axe on six surfaces, a keyboard-only checkout with no `click()` in it, focus
traps and focus restoration), `reduced-motion.spec.js` (each animated surface
with and without `prefers-reduced-motion`) and `metadata.spec.js` (the emitted
head, read out of a real DOM).

`npm run test:e2e` runs the suite and then `e2e/assert-clean.mjs`, which fails
if the run left a state file or a harness process behind.

They are counted separately from the unit and component suites, because an
end-to-end claim is worth only what the browser actually did. They earn their
keep: two defects in this repository were invisible to all 1,202 of the others.
`/collections/*` was a splat route, so `useParams().type` was `undefined` and
every typed collection silently showed the whole catalog — a component test
mounting its own `<Route path="/collections/:type">` proves the filter works and
says nothing about whether the application calls it. And `PATCH` was missing from
the CORS method allow-list, so the admin console's save died in preflight;
Supertest sends no preflight, so the entire server-side suite passed against a
console that could not save.

---

## Known limitations

Stated plainly. Each is tracked and scheduled; none is a surprise.

### Phase 5 deployment stop conditions

The following are **not closed by the application-level security work**. They
block any production or serverless deployment until the named operational control
exists and has been audited:

- Authentication, global API, guest-order and chat limits currently use a
  process-local in-memory store. Their thresholds and chat caps are not global
  across serverless instances. Deployment requires a shared rate-limit store.
- The API's CSP headers protect API responses only. They do not set policy for
  the separately hosted storefront or admin HTML documents. Each SPA hosting
  origin must emit and verify its own CSP before deployment.
- Production admin bootstrap is deliberately absent. The local interactive
  helper is not a production provisioning procedure; deployment requires an
  audited, access-controlled bootstrap and credential-rotation runbook.
- Real migration and cutover execution is deliberately blocked. Deployment
  requires a tested backup/restore and cutover plan, reviewed reports, rollback
  criteria and an accountable operator authorising the exact target.

No deployment should proceed until the shared rate store, HTML-origin CSP,
audited admin bootstrap, and backup/cutover plan are all supplied.

**Security** — application-level Phase 1 work closed

These were the application-level findings that gated Phase 1. Each is now covered
by tests that fail if it regresses; see `backend/test/security/`. The separate
Phase 5 deployment stop conditions above remain open.

- Order totals are computed by the server from the database. Client-supplied
  `amount`, `subtotal` and `delivery_fee` are accepted for backward
  compatibility with a cached bundle and then **ignored**.
- The admin is a user document with `role: 'admin'` and a bcrypt hash.
  `ADMIN_PASSWORD` no longer exists as an environment variable, and a session
  token carries `{ sub, role, v }` and no credential material.
- Tokens expire — 24 h for a customer, 8 h for an admin — and carry an issuer,
  an audience and a token version. `POST /api/user/logout` increments that
  version, revoking every token outstanding for the account.
- Chatbot replies are plain text plus a validated `links: [{ productId, label }]`
  array. There is no HTML anywhere in the contract and no raw-HTML sink in the
  storefront.
- Every endpoint validates its input with a Zod schema, and operator objects
  such as `{"$ne": null}` are refused before any query runs.
- In one API process, rate limiting enforces 5 auth attempts per 15 min, 10 chat
  messages per min, 3 guest orders per hour and 100 requests per min, all per IP.
  Chat messages are capped at 1,000 characters and JSON bodies at 100 KB. The
  process-local store is a deployment blocker described above, not a global
  serverless control.
- `helmet` with a Content-Security-Policy that has no `'unsafe-inline'` in
  `script-src`.
- Uploads use memory storage: no client filename ever becomes a path, only
  PNG/JPEG/WebP is accepted, 5 MB and 4 files maximum, and nothing is written to
  disk.
- Real HTTP status codes throughout, with generic client messages and a
  correlation id. No response carries a stack, a path, a `CastError`, a
  `SyntaxError` or a raw `error.message`, and authentication failures are
  indistinguishable from one another.
- Zero high or critical **runtime** dependency advisories in all three packages.
  CI blocks on `npm audit --omit=dev --audit-level=high`. Dev-only advisories
  are reported separately and do not block.

**Operations and observability** — added in Phase 4

- Structured JSON logging with `pino`, one line per request, correlated with the
  `X-Request-Id` the API already returned. Redaction is a property of the logger
  rather than of each call site, and the tests assert it against **real
  serialised output** — including nested shapes such as `req.headers.token`,
  which is where this API's credential actually lives.
- `GET /health` pings MongoDB and answers **200 only when the ping succeeds**,
  503 otherwise. `GET /` used to answer `"API Working"` whatever state the
  process was in. The body is a fixed vocabulary: no connection string, no host,
  no driver message, no version.
- Sentry is wired but **off**. With no `SENTRY_DSN` it constructs nothing and
  opens no socket, the SDK is injected rather than imported, and `@sentry/node`
  is not a dependency of this repository — so `npm ci` installs nothing that can
  phone home. Reports are scrubbed before they would ever be sent.

**Operations — blocked on an operator, not on code**

Creating a Sentry project and holding its DSN, setting an OpenAI spend alert,
configuring production backups and running a deployment are all actions against
third-party accounts. None was attempted, and none is claimed as done.

**Security — deliberately deferred**

- **Tokens are still in `localStorage`** (SEC-007). This is a reasoned
  trade-off, not an oversight. Moving to an `httpOnly` cookie introduces CSRF
  exposure that does not exist today — the API authenticates with a custom
  `token` header, which browsers never attach cross-origin — so it has to land
  together with CSRF defences rather than before them. With the only XSS sink
  removed and tokens now expiring and revocable, the residual risk is acceptable
  for a demo. Revisit if this ever takes real payments.
- **Operational controls are out of scope for this repository**: an OpenAI spend
  alert, a production CAPTCHA on guest checkout, production secret rotation, and
  deployment verification. They are real and they are needed before a public
  deployment; none of them is a code change, and none was attempted here.

**Data integrity** — closed in Phase 2

Each is now covered by tests that fail if it regresses; see
`backend/test/data-integrity/`, `backend/test/migrations/` and the target-state
suite.

- An order is created inside one MongoDB transaction. Stock is reserved with a
  conditional atomic update, so overselling is not expressible: ten concurrent
  orders against five units produce five orders and leave stock at zero. A
  failure on any line rolls back every decrement, the order, the counter
  allocation and the cart clear together.
- Order numbers come from an atomic counter inside that transaction, with a
  unique index behind them. Fifty concurrent orders receive fifty distinct
  numbers.
- Orders store a full snapshot of every line. Changing, archiving or deleting a
  product does not alter history. Lines reconstructed by the migration are
  flagged and shown as approximations, because historical prices were never
  recorded and cannot be recovered.
- Variant combinations carry their option pairs, with a canonical escaped
  identity. `16-inch` and `RTX-4090` resolve losslessly in both directions in all
  three applications; genuinely ambiguous legacy data is reported for manual
  resolution, never guessed.
- A product with no variants decrements like any other — the empty-string key is
  no longer an update path.
- Money is integer minor units with an explicit `USD`, formatted through
  `Intl.NumberFormat`.
- Repeating a checkout with the same `Idempotency-Key` returns the original
  order and decrements stock once.
- Every queried field is indexed, every list endpoint is paginated, and listing
  orders issues no per-line lookup.

**Data integrity — deliberately deferred**

- **The legacy fields are still written.** `price`, `amount`, `subtotal`,
  `delivery_fee`, `product.inventory` and `order.items[].size` all remain, and
  are kept in step with the canonical ones. Dropping them needs a full release of
  dual-reading first, which is a later migration release — not a Phase 2 one;
  see [Migrations](#migrations) and the deployment stop conditions above.
- **No production backup has been taken**, because there is no production
  database here. It remains the first prerequisite of any real migration run.

**Correctness** — closed in Phase 3

Each is now covered by tests that fail if it regresses; see
`*/src/test/correctness/`, `backend/test/correctness/` and `frontend/e2e/`.

- The storefront mounts its context provider **once**. It mounted two, so every
  fetch ran twice and one set of results was discarded — no consumer was ever
  bound to the outer one.
- There is one HTTP layer (`frontend/src/api/`). `axios` was imported directly in
  fifteen files, six of which fetched the whole catalog independently. One
  shared paginated catalog walk (potentially multiple HTTP page requests) and
  one tags request per page load, asserted in a browser.
- Signing out clears the token, the cart, the wishlist and the guest cart, and
  revokes the session. It used to throw at `setCartItems` — after clearing the
  token and before navigating — leaving the previous customer's cart on screen.
- Collections filters on `tags`, sorts on `date`, and derives its price ceiling
  from the catalog. It filtered on `category` and `createdAt`, neither of which
  the schema has, and capped prices at a hard-coded $1,000 — hiding every laptop
  in a catalog whose laptops start at $1,149.
- The homepage selects products by a `showcase` field. Five components named
  them by literal ObjectId; against any other database one section **crashed the
  whole page** and another displayed a product that does not exist.
- One `ProductCard`, used by all four surfaces. There were four, and the fix to
  image handling had to be made four times.
- Loading, empty and error are distinguished everywhere. The cart declared
  itself empty on a 300 ms timer whether or not the catalog had arrived; the
  wishlist could only leave its loading state via a non-empty catalog, so "you
  have saved nothing yet" was the one case it could not reach.
- A guest cart is merged into the account at sign-in instead of being discarded,
  and the last item removed from it stays removed.
- Chat sessions are documents with a TTL index. They were two module-level
  `Map`s — lost on every restart, absent from the next serverless invocation,
  and one of them never expired at all.
- The admin can edit a product, save a whole variant matrix in one atomic
  request, and archive with a confirmation that names what it is archiving. It
  could previously only add and delete: correcting a typo meant destroying the
  product and orphaning it in every order that referenced it.

**Presentation and honesty** — still open, scheduled for Phase 5

These are the ones that would mislead a visitor, and they are all still here:

- Testimonials, star ratings, review counts and the countdown banner are demo
  content presented as real.
- Several interactive elements do nothing, including the hero's primary call to
  action, the newsletter box and the contact form.
- The shipping and payment copy does not describe what the checkout does: two
  surfaces advertise free-shipping thresholds of $50 and $150, and the flat $3
  delivery fee is what is actually charged. Cash on delivery is the only
  implemented payment path.
- The admin console has two "Under Development" pages and a decorative search
  box and notification badge.

**Performance, accessibility and SEO** — closed in Phase 4

Every figure below is measured locally, on this machine, after the change.
There is no before/after score table because there is no "before" to quote: the
audit ran no Lighthouse and no axe scan, and said so.

- The unused `@splinetool/react-spline` import is gone, along with the injected
  `unpkg.com` viewer script and the unreferenced `scene.splinecode`. **The hero
  is untouched** — it was an `<iframe>` and it stays one. Initial storefront
  JavaScript went from **779.6 kB gzip to 125.0 kB** and `dist/` from 25 MB to
  4.3 MB; the admin's single 282.6 kB gzip bundle became a 153.9 kB shell with
  Recharts on the one route that draws a chart. `npm run budget` re-measures all
  of it from Vite's build manifest — the transitive closure over *static*
  imports, not a sum of `dist/` — and fails if a Spline runtime chunk ever
  reappears.
- The 11.5 MB homepage film is 1.42 MB H.264 and 1.24 MB VP9 in `public/media/`,
  with a real poster frame, `preload="metadata"` and an `IntersectionObserver`
  that attaches no `<source>` until the section is near the viewport.
  `frontend/scripts/optimise-media.sh` is exactly how those were produced.
- All eleven storefront routes and all seven admin routes are `React.lazy`
  chunks. Recharts — most of the admin's old 965 kB bundle — now loads only on
  the one route that draws a chart.
- `prefers-reduced-motion: reduce` stops the marquee and the scrolling text,
  does not autoplay or even fetch the film, and renders a static hero panel
  instead of requesting the 3D scene at all. Without the preference every one of
  those still runs, and the browser suite asserts both halves.
- axe reports **zero critical or serious violations** on home, a seeded product,
  cart, checkout, the open chat and the admin list with its inventory dialog
  open. The whole purchase — browse, product, variant, cart, checkout — can be
  completed by keyboard alone; before Phase 4 the payment selector was two
  `<div onClick>`s and could not be reached by Tab at all.
- Every route has its own title, description and canonical, with Open Graph and
  Twitter Card metadata and a locally generated 1200×630 share image. Structured
  data is `Organization`, `WebSite`, `Product` + `Offer` and `BreadcrumbList`,
  built from catalog data only — there is no `AggregateRating` and no review
  count anywhere, and a test fails if one appears.
- Both storefront and admin lint at **zero errors and zero warnings** with
  `eslint . --max-warnings 0`, and both are blocking in CI, as is the bundle
  budget.

**Performance — independently measured; Gate 4 currently fails**

`npm run lighthouse` builds the storefront against a seeded in-memory API,
serves the production build, and measures three pages in five fresh cold-cache
mobile runs. The runner requires mobile, checks API/CORS health around every
attempt, rejects API error states, and verifies that Cart contains a real seeded
line. Latest valid medians:

| | home | product | populated cart |
|---|---|---|---|
| Performance — mobile (4× CPU throttling, simulated slow 4G) | **77** | **77** | **91** |
| Accessibility — mobile | 95 | 98 | 98 |
| CLS — mobile | 0 | 0 | 0 |
| Transfer | 272 kB | 166 kB | 159 kB |

The roadmap's original Gate 4 target is Performance ≥ 80 on every page. Home and
Product remain below it. On 2026-08-20 the user explicitly accepted Phase 4 with
this documented exception; this is an acceptance-criterion exception, not a
claim that the technical threshold passed. Earlier `83 / 86 / 95` claims in the Phase 4 working record
were not independently reproducible and are superseded by this cold-cache run.
The focused correction did fix a real Product catalog/single-fetch race, prevent
stale responses from clearing selected variants, and remove Product's reproduced
0.269–0.676 layout shift by reserving the main image geometry. Frontend lint,
365/365 tests, production build, bundle budget, and full one-worker E2E pass. Phase 5
remains unstarted pending the cumulative pre-commit review.

**Performance and accessibility — deliberately not claimed**

- **These are local numbers.** They are measured on one Linux machine, under
  emulation, with every non-loopback host blocked at the browser so that no
  external service is contacted. That is a real measurement of a real page; it
  is not a claim about production hosting.
- **The homepage's largest contentful paint, as measured here, is the navbar
  wordmark.** The hero is a `my.spline.design` iframe that the runner blocks,
  and the hero copy holds `opacity: 0` for the first three seconds of a
  four-second entrance animation, so the largest thing the runner can paint is
  the logo. Against a reachable Spline the homepage's real LCP would be the hero
  copy and it would be considerably worse. That entrance timing is a
  presentation decision and is Phase 5's to revisit; it is named here so the 77
  is not read as something it is not.
- **No screen-reader session and no real-device testing were performed.** Roles,
  names, states and live regions are asserted programmatically and by axe; how
  they are *announced* is not.
- **The share card has not been previewed by a crawler.** Facebook's Sharing
  Debugger and X's Card Validator need a public URL. What is verified is the
  exact set of tags they read.
- **The sitemap lists static routes only.** Enumerating products needs
  build-time catalog access, which this workflow does not have; inventing ids
  would produce a sitemap of 404s. Products are reachable from `/products` and
  `/collections`, both of which are in the file.
- **Colour contrast is verified by axe on the scanned pages**, not by a full
  design-system audit.

---

## Roadmap

Work proceeds in dependency order, test-first, without a rewrite:

| Phase | Focus |
|---|---|
| **0** | Safety net — test harnesses, seed, configuration validation, CI *(done)* |
| **1** | Security and trust boundaries *(done)* |
| **2** | Data integrity *(done)* |
| **3** | Correctness *(done)* |
| **4** | Performance, accessibility, SEO *(done)* |
| 5 | Presentation and case-study polish |

Each phase ends at a gate that must pass before the next begins.

---

## Licence

[MIT](LICENSE).
