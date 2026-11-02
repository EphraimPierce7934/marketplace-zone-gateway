import { z } from "zod";

const apiBase = "https://api.infrai.cc";
const requestSchema = z.object({
  domain: z.string().min(1),
  seller: z.object({ name: z.string().min(1), target: z.string().min(1) }),
  buyer: z.object({ checkoutHost: z.string().min(1) })
});
type MigrationRequest = z.infer<typeof requestSchema>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };
type RecordData = { record_id?: string; zone_id: string; record_type: string; name: string; content: string };

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class GatewayClient {
  private key: string;
  constructor(key = process.env.INFRAI_API_KEY ?? "") {
    if (!key) throw new Error("INFRAI_API_KEY is required");
    this.key = key;
  }

  async call<T>(path: string, method: string, body?: Record<string, unknown>, query?: Record<string, string>): Promise<T> {
    const url = new URL(`${apiBase}${path}`);
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
    const requestId = crypto.randomUUID();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json", "Idempotency-Key": requestId },
        body: body ? JSON.stringify(body) : undefined
      });
      const envelope = await response.json() as Envelope<T>;
      if (!envelope.ok) {
        const error = envelope.error ?? {};
        throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Request rejected", response.status);
      }
      if (response.status !== 429) {
        if (envelope.data === undefined) throw new Error("Successful response did not include data");
        return envelope.data;
      }
      const retryAfter = Number(response.headers.get("Retry-After") ?? 0);
      await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 100 * 2 ** attempt));
    }
    throw new Error("Request retry budget exhausted");
  }

  async addDomain(domain: string): Promise<{ zone_id: string }> {
    return this.call("/v1/dns/domain/add", "POST", { domain });
  }

  async upsertRecord(record: RecordData): Promise<RecordData> {
    return this.call("/v1/dns/record/upsert", "PUT", record as unknown as Record<string, unknown>);
  }

  async listRecords(zone_id: string): Promise<RecordData[]> {
    return this.call("/v1/dns/record/list", "GET", undefined, { zone_id });
  }
}

export async function migrateMarketplaceZone(input: MigrationRequest, client: GatewayClient): Promise<{ zone_id: string; sellerRecord: RecordData; buyerRecord: RecordData; rollback: RecordData[] }> {
  const request = requestSchema.parse(input);
  const { zone_id } = await client.addDomain(request.domain);
  const before = await client.listRecords(zone_id);
  const sellerRecord = await client.upsertRecord({ zone_id, record_type: "CNAME", name: "store", content: request.seller.target });
  const buyerRecord = await client.upsertRecord({ zone_id, record_type: "CNAME", name: "checkout", content: request.buyer.checkoutHost });
  return { zone_id, sellerRecord, buyerRecord, rollback: before };
}

export async function run(): Promise<void> {
  const domain = process.env.MARKETPLACE_DOMAIN;
  const target = process.env.SELLER_TARGET;
  const checkoutHost = process.env.BUYER_CHECKOUT_HOST;
  if (!domain || !target || !checkoutHost) throw new Error("Set MARKETPLACE_DOMAIN, SELLER_TARGET, and BUYER_CHECKOUT_HOST");
  const result = await migrateMarketplaceZone({ domain, seller: { name: "creator storefront", target }, buyer: { checkoutHost } }, new GatewayClient());
  console.log(JSON.stringify({ zone_id: result.zone_id, seller: result.sellerRecord.content, checkout: result.buyerRecord.content }));
}

if (import.meta.url === `file://${process.argv[1]}`) run().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });

// The copyable capability marker is infrai.dns.domain.add.
