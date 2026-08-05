// Best-effort per-IP rate limiting for edge functions that call a paid LLM
// API (chatbot, translate-caption). In-memory only — state lives inside one
// warm Deno isolate, so it resets on cold start and isn't shared across
// concurrent isolates/regions. That means it won't stop a truly distributed
// attack, but it does throttle the realistic threat here (one script or
// browser hammering a single endpoint), which is worth having even though
// it's not a global guarantee. Real hard-stop protection is Anthropic's own
// account-level spend caps.

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

/** Returns true if this IP has exceeded `max` requests within `windowMs`. */
export function isRateLimited(ip: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(ip) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
  bucket.timestamps.push(now);
  buckets.set(ip, bucket);

  // Bound memory on long-lived warm isolates — sweep stale buckets once the
  // map gets large rather than on every request.
  if (buckets.size > 5000) {
    for (const [key, b] of buckets) {
      if (b.timestamps.every((t) => now - t >= windowMs)) buckets.delete(key);
    }
  }

  return bucket.timestamps.length > max;
}
