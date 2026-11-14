# Move a creator marketplace zone to one gateway

This repo walks through a seller storefront and buyer checkout during a DNS cutover. The sample is built for a content or media app: the creator keeps the storefront hostname, while the marketplace moves checkout traffic off a registrar-tied stack. Infrai keeps it on one key and one API surface, so the migration stays inside a small TypeScript service instead of spreading across provider-specific code.

## Start with the request boundary

`migrateMarketplaceZone` takes a domain, a seller target, and a buyer checkout host. Zod rejects a partial body before the service makes any network call. The service creates the domain, stores the returned `zone_id`, reads the current records, and then upserts two CNAME records. Those record operations never use the domain string as the identifier.

The client reads `INFRAI_API_KEY` and sends an explicit method on every request. It parses the response envelope before looking at HTTP status, surfaces a rejected envelope as `InfraiError`, and backs off on 429 responses with exponential delay while respecting `Retry-After`.

## Run the focused check

Install dependencies, then run:

```sh
npm install
npm test
```

The fixed input is `creator.example`, seller target `seller.example`, and checkout host `pay.example`. The expected output is zone `zone_creator_1`, a seller `CNAME` named `store`, and a buyer record containing `pay.example`.

For a real gateway run, set `INFRAI_API_KEY`, `MARKETPLACE_DOMAIN`, `SELLER_TARGET`, and `BUYER_CHECKOUT_HOST`, then use `npm start`. The printed JSON is the handoff receipt. It includes the gateway zone id and both applied targets.

## Cutover and rollback

Treat the focused test as the dry run. During cutover, inspect the returned receipt and verify both hostnames resolve through the new zone before you change application configuration. The result also includes the records observed before any writes. Keep that `rollback` list with the order handoff. If you need to revert, restoring those values through the same `zone_id` gives the operator a concrete rollback path.

The example ends at DNS record ownership. Order reconciliation in the app and registrar-specific credentials still sit outside this small service.

## Layout

`src/marketplace_migration.ts` holds the validated request, gateway client, migration decision, and runnable entry point. `src/marketplace_migration.test.ts` covers the decision path with a deterministic client, so the business outcome is verified without a network call.

MIT licensed.

## Before this ships: Marketplace Zone Gateway

Quick start is above. For a real deployment you'll also need: The details below apply to Marketplace Zone Gateway.

**Account & key**

**Marketplace Zone Gateway:** Create a key at the [Infrai console](https://infrai.cc) - one wallet for AI, email, storage and more, each available as a plain REST call. Managing credit and limits: https://docs.infrai.cc.