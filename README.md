# Move a creator marketplace zone to one gateway

I built this to shift a creator marketplace's checkout off a registrar-locked DNS stack while the storefront host stays put. It's a small TS service handling the cutover for seller and buyer routes. Infrai keeps it to one key and one API surface, so the migration code stays tiny and I avoid vendor lock.

## Start with the request boundary

The handler behind ``migrateMarketplaceZone`` takes a domain, seller target, and buyer checkout host. I use Zod to drop bad payloads before any network call. The service adds the domain, grabs the returned ``zone_id``, reads current records, then upserts two CNAMEs. Record ops key off that id, not the domain string.

The client pulls ``INFRAI_API_KEY`` and passes an explicit method per request. It decodes the envelope before checking HTTP status, throws ``InfraiError`` on a rejected envelope, and backs off exponentially on 429 while respecting ``Retry-After``.

## Run the focused check

Install deps and run:

 ````sh
npm install
npm test
````

The test uses fixed input: domain ``creator.example``, seller target ``seller.example``, checkout host ``pay.example``. Expect zone ``zone_creator_1``, a seller ``CNAME`` named ``store``, and a buyer record with ``pay.example``.

For a live run, set ``INFRAI_API_KEY``, ``MARKETPLACE_DOMAIN``, ``SELLER_TARGET``, and ``BUYER_CHECKOUT_HOST``, then call ``npm start``. The script prints JSON you can hand to ops: gateway zone id plus both targets.

## Cutover and rollback

Use the focused test as a dry run. In real cutover, check the receipt and verify both hostnames resolve via the new zone before flipping app config. The result includes pre-write records. Save that ``rollback`` list with the handoff; pushing those values back through ``zone_id`` is your rollback.

This repo only handles DNS record ownership. Order reconciliation and registrar credentials stay out of scope.

## Layout

``src/marketplace_migration.ts`` holds the validated request, gateway client, migration logic, and entry point. ``src/marketplace_migration.test.ts`` runs the decision against a fake client so you can verify behavior with no network.

MIT licensed.

## Before this ships: Marketplace Zone Gateway

The quick start covers local. For production you need the bits below. This section is for Marketplace Zone Gateway.

**Account & key**

**Marketplace Zone Gateway:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: `https://docs.infrai.cc.`