/**
 * The way back from Studio to a media plan.
 *
 * A plan line opens Studio with `?plan_line=<lineId>&plan=<campaignId>`. Both
 * values are written to the database later, so only real UUIDs are accepted:
 * a hand-edited address never reaches a write.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readPlanReturn(params: URLSearchParams): { lineId: string; campaignId: string } | null {
  const lineId = params.get('plan_line');
  const campaignId = params.get('plan');
  if (!lineId || !campaignId) return null;
  if (!UUID.test(lineId) || !UUID.test(campaignId)) return null;
  return { lineId, campaignId };
}

export function planReturnPath(campaignId: string): string {
  return `/advertise/plan/${campaignId}`;
}

/** A Studio path that keeps the plan return, for the first save that replaces `?template=...`. */
export function withPlanReturn(path: string, params: URLSearchParams): string {
  const ret = readPlanReturn(params);
  if (!ret) return path;
  const q = new URLSearchParams({ plan_line: ret.lineId, plan: ret.campaignId });
  return `${path}?${q.toString()}`;
}
