This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Subscriptions and Stall Review

Run these migrations in order in the Supabase SQL Editor:

1. `supabase/migrations/20261024000000_landlord_stall_rls.sql`
2. `supabase/migrations/20261024000100_allow_public_stall_posts.sql`
3. `supabase/migrations/20261028000000_stall_review_workflow.sql`
4. `supabase/migrations/20261028000200_mpesa_subscriptions.sql`
5. `supabase/migrations/20261028000300_vendor_updates.sql`
6. `supabase/migrations/20261028000400_residential_property_profiles.sql`
7. `supabase/migrations/20261028000500_residential_platform_workflows.sql`
8. `supabase/migrations/20261028000600_residential_saved_searches.sql`
9. `supabase/migrations/20261028000700_residential_operations.sql`
10. `supabase/migrations/20261028000800_residential_promotions.sql`
11. `supabase/migrations/20261031000000_commercial_marketplace.sql`
12. `supabase/migrations/20261031000100_commercial_stall_media.sql`
13. `supabase/migrations/20261031000200_kenya_county_locations.sql`
14. `supabase/migrations/20261031000300_home_services_directory.sql`
15. `supabase/migrations/20261031000400_expanded_keja_platform.sql`
16. `supabase/migrations/20261031000500_beyond_rentals.sql`
17. `supabase/migrations/20261105000000_moving_delivery_requests.sql`
18. `supabase/migrations/20261105000100_everyday_directory.sql`
19. `supabase/migrations/20261105000200_orders_stays_payments.sql`
20. `supabase/migrations/20261105000300_kenya_ward_locations.sql`
21. `supabase/migrations/20261105000400_nationwide_foundations.sql`
22. `supabase/migrations/20261105000500_specialized_department_requests.sql`
23. `supabase/migrations/20261105000600_workflow_notifications.sql`
24. `supabase/migrations/20261105000700_county_saved_search_alerts.sql`
25. `supabase/migrations/20261110000000_commercial_stall_reports.sql`
26. `supabase/migrations/20261110000100_listing_freshness_and_stall_map.sql`
27. `supabase/migrations/20261110000200_expand_everyday_departments.sql`

Anonymous posting is disabled. Browsing stays public, while posting requires a confirmed Supabase account and an active KES 1,000 subscription. A verified M-Pesa payment grants one month; renewals are prompted manually, not charged automatically. Stall submissions remain pending until an approved reviewer approves them. Existing stalls are moved to pending by the review migration and need an active owner subscription before they appear publicly.

The commercial marketplace migration adds stall location, category, and description fields, and creates a private inquiry/application workflow. Public visitors can browse approved stalls and filter by location, category, availability, and budget. Applicants must sign in to contact a landlord. Landlords can review their listings and respond to applications at `/landlord/stalls`; inquiry contact details are visible only to the applicant and the stall owner.

The commercial stall media migration adds private photo and video storage for commercial listings. Landlords can upload up to 12 JPEG, PNG, WebP, MP4, or WebM files (50 MB each) when posting at `/post` or `/dashboard`. Approved active listings show their gallery on the stall detail page; original media is delivered through short-lived signed URLs.

The Kenya county location migration adds searchable county and town fields to residential properties and commercial stalls. New listings ask landlords for county, town/city, and estate/area; county filters query the database. Existing location text is not automatically reclassified, so legacy listings remain visible in unfiltered search until structured location data is available.

The ward location migration adds an optional ward field to homes and commercial stalls. New listings can be organized by county, town/city, ward, and estate/area; ward is included in text search. Existing listings are not automatically assigned wards. Apply all migrations in order before using the latest directory, commerce, and ward features.

The everyday departments migration adds construction, household essentials, and automotive listings to the directory. Market & food listings use the existing food department, and shopping products use the existing marketplace and checkout flow. Healthcare listings are moderated but are not independently credential-verified by MTAA; users should check credentials with the relevant professional regulator. Healthcare inquiries collect appointment logistics only, not medical records or symptoms.

The nationwide foundations migration adds an admin-only county coverage report at `/admin/coverage`, a sourced ward dataset import at `/admin/locations`, and private request/reply workflows for approved healthcare, education, transport, agriculture, events, and business listings at `/directory` and `/dashboard/requests`. New department requests and provider updates create in-app notifications. MTAA does not bundle an official ward dataset: administrators must verify the source and import its JSON, with `county`, `sub_county`, and `ward` fields. The migration backfills county only for unambiguous exact location tokens; ward is backfilled only after an administrator imports a verified dataset and a listing has one exact ward match.

The county saved-search migration adds a structured county filter to residential alerts and makes their price matching support nightly short stays. Existing searches with a location equal to a county name are migrated to that county field; other existing searches retain their location matching. County coverage demand uses structured county selections, with a legacy text fallback for older searches.

The commercial stall reports migration lets signed-in users report approved stall listings, with a reason and optional details. Residential and commercial listing reports are reviewed in the admin dashboard at `/admin/properties`; admins can mark open reports as reviewing, resolved, or dismissed.

The listing freshness and stall map migration prompts home and stall owners to reconfirm availability every 30 days. Listings remain visible when overdue but show a freshness warning until their owner confirms them from `/landlord` or `/landlord/stalls`. It also adds optional map pins to stalls; owners can place or update a pin on OpenStreetMap in the stall dashboard. Public stall pins are rounded to two decimal places for privacy. `/homes` and the homepage stall search show interactive OpenStreetMap views for mapped results; listings without a pin remain in the list.

The specialized department request migration adds validated, private request details for health appointments, education enrollment/tutoring inquiries, transport trips and deliveries, agricultural produce/service requests, event-service bookings, and business inquiries. Healthcare requests collect appointment logistics only, not symptoms or medical records. These requests are inquiries, not confirmed bookings or payments; providers and customers must agree on availability, safety, and terms directly.

The workflow notifications migration creates in-app alerts for job applications and employer decisions, confirmed marketplace/food payments and fulfillment changes, property stay requests and host decisions, and home-service inquiries and provider updates. SMS/WhatsApp sends still require user consent and the configured dispatcher described above.

Directory owners can review, edit, and remove their listings at `/dashboard/listings`. Editing a public listing returns it to moderation; it will not silently republish changed business details.

The shared language selector supports English and Kiswahili and persists the selection. Core discovery flows now include Kiswahili translations for homepage stall search, residential search, listing details, maps, and report forms. Other pages and some detailed notices still need translation review. Twilio SMS/WhatsApp delivery is implemented but requires server credentials, a verified sender, an approved WhatsApp template, a scheduled dispatcher, and user opt-in before messages can be sent.

## Google Gemini Assistant

The MTAA assistant keeps its offline guide and also offers an authenticated Google Gemini mode at `/assistant`. It sends only the question to Google; users are warned not to submit sensitive information. The API route applies a limit of 10 questions per signed-in user per minute and does not have access to live listings. Configure `GEMINI_API_KEY` as a server-only deployment secret; optionally set `GEMINI_MODEL` (defaults to `gemini-2.5-flash`). Apply the nationwide foundations migration first.

## Twilio SMS and WhatsApp notifications

Users can manage alerts at `/settings/notifications`. A Kenyan mobile number must pass Twilio Verify before SMS or WhatsApp opt-in can be saved. New in-app notifications, including department request and response updates, are queued only for channels the user enabled; delivery rechecks current consent and phone verification. Configure these server-only deployment secrets:

```dotenv
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_VERIFY_SERVICE_SID=your-verify-service-sid
TWILIO_SMS_FROM=+1...
TWILIO_WHATSAPP_FROM=+1...
TWILIO_WHATSAPP_CONTENT_SID=HX...
KEJA_NOTIFICATION_CRON_SECRET=generate-at-least-32-random-characters
```

WhatsApp delivery uses a Twilio-approved content template with one text variable (`{{1}}`); set its SID as `TWILIO_WHATSAPP_CONTENT_SID`. Schedule an authenticated `POST /api/notifications/dispatch` every few minutes with `Authorization: Bearer <KEJA_NOTIFICATION_CRON_SECRET>`. The dispatcher claims a small batch using row locks, retries transient failures up to five times, and stores provider IDs/error codes without exposing the queue to clients. Use Twilio test credentials or sandbox numbers before enabling real delivery. No provider credentials are committed to the repository.

## Home Services Directory

The home-services directory is available at `/services`. Customers can filter verified providers by county and service type, view a provider profile, and send a service request after signing in. Providers manage their profile and incoming requests at `/services/provider`; new profiles require administrator approval in `/admin/services` before public listing. Updating a verified profile returns it to pending review. Customer contact details are visible only to the customer and provider. MTAA does not guarantee service quality or set provider prices; customers and providers agree on scope and payment directly.

## Land, Commercial, Short Stays, and Property Management

The expanded platform migration adds land and commercial property types, plus short-stay listings with nightly rates and host-defined booking and cancellation policies. Browse them alongside residential listings at `/homes` and `/properties/<property-id>`. Short-stay guests request dates; hosts confirm or decline from `/landlord`. MTAA does not collect booking or rent payments.

Owners can track tenancy details and due/paid rent records at `/landlord/management`; this is record keeping and reminders only, not payment processing. The `/financing` directory lists verified lender contacts. Listings are informational only: MTAA does not approve loans, recommend financial products, or guarantee a lender or provider.

Service customers may review a provider after the related request is marked completed. New reviews require moderation and appear publicly after approval in the admin service workspace.

## More than Rentals

The beyond-rentals migration expands the provider directory with construction, architecture, surveying, landscaping, equipment hire, storage, and relocation services. Use `/services` to browse and `/services/provider` to register a provider profile; provider verification and service-request rules still apply.

`/jobs` supports property-sector job posts, applications, and owner responses. Job posts are private to their owner until an administrator publishes them at `/admin/community`; application details are only visible to the applicant and job owner. `/neighborhoods` provides an admin-reviewed guide to local places and community notices. Signed-in users can suggest entries. `/insights` compares current verified asking prices by area and property type. These are listing snapshots, not transaction data, valuations, financial advice, or guarantees.

Owners can link a tenant's MTAA account ID to an active tenancy in `/landlord/management`. Linked tenants can access `/tenant` to view their tenancy and submit maintenance requests; only the tenant and property owner can view those requests. Review pending job, neighborhood place, and community notice submissions at `/admin/community`. MTAA does not collect rent or maintenance payments.

Add trusted reviewer accounts to `public.stall_reviewers` using their Supabase Auth user ID:

```sql
insert into public.stall_reviewers (user_id)
values ('REVIEWER_AUTH_USER_UUID')
on conflict do nothing;
```

Reviewers sign in at `/dashboard` and use `/admin/reviews`. Approval and public visibility are enforced by database RLS, not only the UI.

## M-Pesa Server Configuration

Set these server-only variables in `web/.env.local` for local development and in the deployment platform's secret environment settings for production. Never use a `NEXT_PUBLIC_` prefix for these values or commit their real values:

```dotenv
APP_BASE_URL=https://your-public-https-domain
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
MPESA_ENVIRONMENT=sandbox
MPESA_CONSUMER_KEY=your-daraja-consumer-key
MPESA_CONSUMER_SECRET=your-daraja-consumer-secret
MPESA_SHORTCODE=your-daraja-shortcode
MPESA_PASSKEY=your-daraja-passkey
MPESA_PARTY_B=your-paybill-or-till-number
MPESA_TRANSACTION_TYPE=CustomerPayBillOnline
MPESA_CALLBACK_TOKEN=generate-at-least-32-random-characters
```

Use the Safaricom Daraja sandbox first. For PayBill, use `CustomerPayBillOnline`; for Till, use `CustomerBuyGoodsOnline` and set `MPESA_PARTY_B` to the Till number. The callback URL is `${APP_BASE_URL}/api/payments/mpesa/callback?token=...` and must be publicly reachable over HTTPS. Configure the matching callback/redirect settings with Safaricom and Supabase. Do not enable production payments until sandbox callbacks, duplicate callbacks, cancelled payments, and mismatched amounts have been verified.

The server verifies the transaction with Daraja before activating a subscription. Public clients cannot write payment or subscription records. Add CAPTCHA and edge rate limiting before opening account registration broadly; the payment route currently limits attempts per account.

## Vendor Community

The public `/community` feed shows approved updates from vendors with an active subscription. Subscribers can submit text with up to five JPEG, PNG, WebP, MP4, or WebM files (50 MB each). Files remain in a private Supabase Storage bucket and are delivered with short-lived signed URLs after approval. Signed-in users can like and comment; reviewer accounts moderate posts at `/admin/reviews`. The final migration creates all community tables, private storage policies, review rules, and the five-media database limit.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Residential Property Profiles

The shared layout includes a keyboard-accessible skip link, visible keyboard focus, reduced-motion support, and responsive navigation on the marketplace entry points. The interface is currently English-first; translated interface content and full dark-mode support are not yet available.

The residential marketplace is additive and separate from the commercial `stalls` marketplace. Apply both residential migrations above. Browse and search homes at `/homes`; view a property at `/properties/<property-id>`; manage owner/agent listings at `/landlord`; use the assignment-scoped caretaker workspace at `/caretaker`; and review residential verification and reports at `/admin/properties`. Signed-in users can save and compare homes, request viewings, message property owners, review properties, report listings, and view notifications.

Property profiles include rent or sale price, deposit, home type, building and unit labels, rooms, size, utilities, amenities, availability, verification status, private-bucket photos/videos, an optional 360-degree tour URL, and nearby-service listings. Search understands common phrases for bedrooms, budget, location, parking, water, and named nearby services. Home search can use browser geolocation by request, filtering homes by a selectable 500 m, 1 km, 2 km, or 5 km radius and displaying approximate distances from rounded public map pins. Its nearby-service filters use owner-entered distances, which are estimates and are not independently verified. Property details also fetch named nearby places from OpenStreetMap within 5 km and provide category and radius filters; those distances are straight-line estimates and the map data may be incomplete or out of date. Approximate coordinates are rounded before being used for public maps and nearby searches; exact pins are used only when the listing owner explicitly selects exact location.

The property page calculates an area amenity-coverage indicator from six categories of mapped places within the selected radius. It is not a safety rating or a complete liveability score; the app does not infer crime levels, network quality, or service quality from map data.

Only verified residential listings are visible in public search, property details, nearby-service data, and media. New and previously unverified listings require approval; only a trusted administrator can change verification status. The admin workspace also moderates property reviews, reviews landlord/agent verification requests, and suspends or restores Supabase Auth accounts. Users can save searches at `/homes` and manage them at `/saved-searches`; new verified listings produce in-app notifications when they match the saved search's listing type, location, price, bedroom, and selected nearby-service filters. Recommendations are based on similarities to a user's saved homes. Owners can create agencies, manage membership and attach properties; agents in an agency can manage linked listings, while caretakers must still be assigned to properties individually. Caretakers can only view assigned properties and update availability through a constrained RPC; owner payment records are not included in the caretaker workspace. Managers can update listing prices. Verified, available rentals/sales can be featured for KSh 200/7 days or KSh 500/30 days using the configured M-Pesa flow. Admins can verify listings and handle reports. To bootstrap a trusted residential administrator, run this once as a database administrator, replacing the UUID with a trusted Supabase Auth user ID:

```sql
insert into public.platform_user_roles (user_id, role)
values ('TRUSTED_ADMIN_AUTH_USER_UUID', 'admin')
on conflict do nothing;
```

The SQL editor/database administrator must assign the admin role; clients cannot grant themselves administrative access.

The OpenStreetMap Overpass service is public and rate-limited; nearby lookup is cached for up to one hour. No route-based distances or independent business verification are claimed. Residential promotions are separate from stall subscriptions and require the same server-only M-Pesa and Supabase service-role settings documented above. If a listing becomes ineligible after a payment starts, payment is recorded and the user is notified to contact support rather than silently losing the callback.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
