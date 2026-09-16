# Product direction

Parkly connects drivers with people authorized to rent parking spaces. General-purpose discovery is the primary flow. Event parking is a differentiator: organizers reserve nearby supply ahead of time and distribute allocation through invitations.

The initial geographic focus is Hyderabad. Roles: driver, space owner, event organizer, attendant. Shared inventory must never be double-booked across direct bookings and events.

## PRISM adaptation

Canvas #f4f7fb; recessed canvas #eaf0f7; ink #09111f; secondary #455468; tertiary #5b6a80; ice #86ddf1; azure #4d8dff; indigo mist #a6a3e8. Geist interface typography, Instrument Serif editorial accents, Geist Mono utility labels. Layered translucent surfaces, white edge highlights, 22px cards, 28px islands, 12px controls, pill actions. Main page is destination search with parking results and a map.

## Production priorities

1. Verified owner/driver identities and access policies; owner consent and valid inventory.
2. Availability calendars, individual bays, buffer times, event cancellation and no-show policies.
3. Real entrance geocoding, walking-distance ranking and directions.
4. Payments, refunds, host payouts and support procedures.
5. A validated parking-specific on-device model with calibrated capture/manual measurements, robust uncertainty handling and hardware benchmarking.
6. Camera-based pass scanning, signed cached passes and explicit offline revocation/replay boundaries.
7. Rate limits, audit logging, retention, privacy controls, deployment configuration and operational monitoring.

## Demo sequence

1. Search Jubilee Hills; filter for vehicle and covered parking.
2. Open a space, reserve using a fictional registration and show its pass.
3. Create an event using available capacity in another location.
4. Copy the invitation, open it in another browser/session, and claim a compatible space.
5. View capacity on the organizer screen.
6. Add a sample owner listing and complete its required local MobileViT photo analysis.
7. Reserve a space and share the generated PDF pass through Android's native share sheet.
8. Explain which functionality is implemented and which is a production follow-up.
