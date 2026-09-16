# Parkly

A mobile-first Hyderabad parking prototype: individual parking discovery and reservations, plus organizer-funded event inventory and guest invites. Inspired by JustPark's destination/time search and reservation patterns, with visual tokens and components adapted from CampusLens PRISM.

## Run locally

Requires Node.js 20.20+ and npm. SQLite is embedded; no database service or API key is needed.

```sh
npm ci
npm run dev
```

Open http://localhost:5173. The API runs on 127.0.0.1:3001. To serve the compiled application:

```sh
npm run build
npm start
```

Open http://localhost:3001. Both servers bind to localhost by default. Phone access requires an explicitly configured network deployment or secure tunnel; localhost on a phone points to the phone itself.

```sh
npm test
```

## Android APK

Parkly includes a Capacitor Android project with package ID `com.safwanshk.parkly`.

```sh
npm run android:apk
adb reverse tcp:3001 tcp:3001
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

The debug APK bundles the complete user interface. During development, its booking and event data service runs from this repository on the connected Mac, so the Express server must be running and port 3001 must be forwarded through ADB. A production release still needs hosted APIs, production authentication, release signing and store assets.

Prebuilt development APKs are published under this repository's GitHub Releases. They are debug-signed test builds, not Play Store releases.

## Implemented

- Destination search across Hyderabad fixtures; custom arrival/leaving popouts; vehicle, covered, EV and price filters; sorting; saved spaces.
- Full-screen mobile OpenStreetMap experience with selectable price pins, a floating search header, listing preview sheet and list/map switch.
- Parking details, access instructions, hourly totals, reservation, QR reference pass, navigation handoff, and cancellation.
- SQLite-backed transactional capacity accounting. Event allocations consume shared inventory before guests claim passes.
- Organizer events with bulk capacity reservations, invite URLs, compatible guest claims, duplicate-claim protection, and capacity tracking.
- Owner listing form with entrance coordinates, vehicle restrictions, capacity and price; owner arrivals and authorized online check-in.
- Required browser-local MobileViT analysis in the owner-listing flow. The open-source model runs through CPU/WASM on the phone; images are not uploaded to the backend or saved to listings.
- Automatic PDF parking passes with QR references and the Android share sheet for WhatsApp, email, Drive or local saving.
- Keyboard focus trap, labels, reduced-motion support, responsive layouts, empty/error/loading states.

## Honest boundaries

This is a working local prototype, not a production marketplace or full JustPark feature parity. All seeded spaces and prices are fictional demonstration inventory. Reservations convey no actual parking right; no payments are taken.

Identity is a random browser-local bearer session, not verified login. Keep the prototype local until real authentication, account recovery, abuse protection, authorization review and deployment hardening are implemented. Anyone with a session token can act as that session. Event links are bearer invitations; anyone with the link can attempt to claim a pass.

Listings currently have continuous availability. Owner schedule editing, verification, reviews, pricing plans, payments, payouts, refunds, notifications, QR camera scanning, location search/geocoding and production mapping contracts remain future work. The attendant enters a QR's booking reference manually; verification requires connectivity. Generated PDF passes can be kept offline, but are not signed offline credentials.

Monthly selects a 30-day window at the hourly rate; there is no monthly discount product. Airport search selects the Shamshabad demo area and does not include airport access or shuttles.

Event locations are allocated in the organizer's selected order, not calculated walking distance. A parking location has fungible capacity rather than individually numbered bays. No automatic release of no-shows or event cancellation UI is implemented.

The owner-listing flow requires `Xenova/mobilevit-xx-small` via Transformers.js, executing locally through CPU/WASM. Initial model/WASM downloads need connectivity. It supplies general environmental labels that support listing review; it does not provide calibrated measurements, obstacle guarantees, parking suitability or NPU acceleration. Owners must still confirm dimensions, access and vehicle fit.

The interface is a React/Vite PWA-compatible web layer packaged as an Android application with Capacitor. This keeps the project within the hackathon's permitted PWA path while producing an installable APK. Confirm final eligibility and permitted pre-event preparation with the organizers.

## Architecture

`src/main.tsx`: React entry. `src/App.tsx`: application and flows. `src/style.css`: PRISM-derived theme and responsive components. `server/store.js`: SQLite schema, fixtures, transactional inventory. `server/index.js`: Express API and static serving. `tests/reservations.test.js`: capacity, rollback, compatibility and cancellation invariants.

SQLite data persists in `data/parkly.sqlite` and is ignored by Git. Browser session and saved-space preferences use local storage. Dates are sent as ISO instants and shown in browser local time; use Asia/Kolkata for the Hyderabad demo.

## References and attribution

- Functional research: https://www.justpark.com/
- Visual reference: https://campuslens-tan.vercel.app/design-system
- AI model: https://huggingface.co/Xenova/mobilevit-xx-small
- Maps: https://www.openstreetmap.org/copyright
- Icons: Lucide (ISC). Fonts: Geist, Geist Mono and Instrument Serif via Google Fonts (SIL OFL).

No JustPark source code, brand assets, reviews or space inventory were copied. Parking-card artwork is a neutral type icon, not a photograph of a real listing.

## Hackathon preparation

The supplied iQOO rules require submission code to be written during the event window. This repository was prepared before that window: treat it as a reference prototype, not an eligible event submission without explicit organizer guidance. See `docs/product-brief.md` for the scope and next steps.
