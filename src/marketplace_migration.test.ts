import assert from "node:assert/strict";
import { migrateMarketplaceZone } from "./marketplace_migration.ts";

class FakeClient {
  async addDomain(): Promise<{ zone_id: string }> { return { zone_id: "zone_creator_1" }; }
  async listRecords(): Promise<never[]> { return []; }
  async upsertRecord(record: Record<string, string>): Promise<Record<string, string>> { return record; }
}

const result = await migrateMarketplaceZone({ domain: "creator.example", seller: { name: "video shop", target: "seller.example" }, buyer: { checkoutHost: "pay.example" } }, new FakeClient() as never);
assert.equal(result.zone_id, "zone_creator_1");
assert.equal(result.sellerRecord.record_type, "CNAME");
assert.equal(result.sellerRecord.name, "store");
assert.equal(result.buyerRecord.content, "pay.example");
console.log("migration decision test passed");
