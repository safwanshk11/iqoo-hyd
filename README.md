# Parkly

Mobile-first parking discovery and hosting for Hyderabad, packaged as a Capacitor Android APK. React/Vite UI, Express API, Neon PostgreSQL in deployment and SQLite for local development.

## Run locally

Requires Node.js 20.20+ and npm.

```sh
npm ci
DATABASE_URL='' npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to port 3001. Setting `DATABASE_URL` selects Neon instead; `.env` is loaded by the server only. Never put database credentials into a `VITE_` variable.

```sh
npm run build
DATABASE_URL='' npm start
npm test
npm run test:neon
```

`test:neon` reads `DATABASE_URL`, creates a randomly named isolated test schema, runs the account/permission/inventory integration suite, then removes only that schema. It never uses the public tables for test fixtures.

## Accounts and permissions

Create an account with email, name and a password of at least 12 characters. Every account can use the Driver workspace. Choosing Host at registration, or selecting **Become a host** in the account menu, adds the Host role. The account menu lives inside the expanding navigation bar and switches workspaces; this does not change server permissions.

| Role | Access |
|---|---|
| Driver | Requirements, search/map, saved spaces, own bookings and passes, event invitations and organization |
| Host | Own spaces, editable rates, availability blocks, own guest arrivals and check-in |
| Admin | Listing approval/rejection/pause, account suspension/reactivation |

Passwords use salted scrypt hashes. Sessions are random 256-bit credentials held in HTTP-only cookies; only token hashes are stored in the database. Sessions expire after seven days and are revoked on logout. Each API request reloads account status and roles. The API checks listing ownership and booking ownership independently of the UI. JSON requests, an explicit origin allowlist and SameSite cookies protect browser mutations; authentication attempts are rate-limited per server process.

Administrators cannot be created through registration or a role-switch request. To bootstrap an administrator, first register the intended account, then run this trusted server command against the same database:

```sh
node server/admin.js your-registered-email@example.com
```

For local SQLite with an existing Neon `.env`, prefix that command with `DATABASE_URL=''`. Sign in again or reload to see the Admin workspace. There are no hardcoded administrator credentials.

## Listings, availability and rates

New or edited host listings enter `pending_review`. An administrator approves them before they appear in searches or accept new individual bookings. Hosts can pause a listing and resubmit it. Existing bookings remain valid when a listing is paused or awaiting review.

Approved spaces are continuously available except for host-defined blocked periods and existing inventory reservations. A blocked period cannot overlap a booking or event allocation. Capacity/vehicle restrictions cannot change while future reservations exist.

Hosts set hourly, daily and monthly rates. The server supplies the displayed quote and calculates the final booking amount:

- Under 24 hours: hourly charge capped at the daily rate.
- From 24 hours through exactly ten days: complete days plus capped hourly remainder.
- Over ten days: full 30-day billing periods at the monthly rate. No proration.

The booking window remains limited to 32 days. Legacy demo rates migrate to an explicit daily price of 8 hourly rates and monthly price of 120 hourly rates; host rates can subsequently be edited. PostgreSQL inventory changes use a transaction-scoped advisory lock so simultaneous requests cannot oversell a space.

## Deployment and Android

`render.yaml` builds the frontend and serves it with the API. Set the server's `DATABASE_URL` secret. Production uses secure cookies. Configure `APP_ORIGINS` as comma-separated exact origins when adding frontend domains; same-origin web requests work directly. Capacitor HTTP support uses the native networking/cookie layer.

```sh
# Development APK uses the Mac's API through USB forwarding.
npm run android:apk
adb reverse tcp:3001 tcp:3001
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# For a hosted-API APK, set the public endpoint at build time.
VITE_API_URL=https://parkly-api-pslb.onrender.com/api npm run android:apk
```

The Android package is `com.safwanshk.parkly`. APKs are debug-signed test builds. `VITE_API_URL` is a public API URL, never a database connection string. Web builds default to same-origin `/api`; the native development fallback is `http://localhost:3001/api`.

Migrations add tables and columns without deleting legacy inventory or bookings. Old anonymous-session records are retained but are not automatically assigned to new accounts: possession of an old browser-generated UUID does not establish account ownership.

## Features and current limits

Driver requirements appear as one form on app launch, over a soft tricolour canvas and 24-spoke Chakra. Arrival/leaving use date/time popouts. Discovery has list/map modes, rates, availability, requirements editing and a custom sort menu. Use current location finds inventory within 10 km and ranks it by distance; coordinates stay on the device for matching. Android asks for location access only when requested. Drivers can reserve, cancel, navigate to the entrance, and download/share PDF QR passes. Hosts can scan or manually verify a pass online during its arrival window. Event organizers reserve shared inventory and distribute guest invitation links.

The owner listing flow includes the open-source `Xenova/mobilevit-xx-small` model through Transformers.js and CPU/WASM. The model runs locally; photos are not uploaded. General scene labels help review a listing but do not establish dimensions or parking safety.

This is demonstration inventory; no payments, real parking rights, payouts or revenue collection are implemented. Authentication now identifies accounts, but email verification, password recovery, payment integration, review/dispute handling, recurring opening hours and production release signing remain future work. QR passes require an online ownership/status check and are not signed offline credentials. Login throttling is process-local; multi-instance production needs a shared limiter.

## Code and verification

- `server/app.js`: shared authenticated API for SQLite/Neon.
- `server/auth.js`: account and session handling.
- `server/database.js`: migrations and parameterized database adapter.
- `server/store.js`, `server/neon-store.js`: inventory transactions.
- `server/pricing.js`: authoritative pricing rules.
- `server/availability.js`: transactional host availability blocks.
- `src/auth/`: sign-in, registration, role switching and session guard.
- `src/host/`, `src/admin/`: host availability and admin review interfaces.
- `src/shared/`: credentialed API client.
- `src/App.tsx`: driver flows, maps, host shell, events, listing and passes.
- `tests/`: pricing, inventory, authorization, account isolation and session lifecycle tests.

## References

Functional patterns: [JustPark](https://www.justpark.com/). Original visual reference: [CampusLens PRISM](https://campuslens-tan.vercel.app/design-system), subsequently restyled with the local Parkly theme. Maps: OpenStreetMap. Icons: Lucide. Fonts: Geist, Geist Mono and Instrument Serif. No JustPark source or real inventory was copied.

The supplied hackathon rules require event-window submission code. This repository predates that window; confirm eligibility with the organizers. See `docs/product-brief.md` for the original product scope.
