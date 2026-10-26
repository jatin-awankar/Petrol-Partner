import { z } from "zod";

export const DEPARTURE_OPEN = 16 * 60 + 45;
export const DEPARTURE_CLOSE = 17 * 60 + 30;
export const RESPONSE_WINDOW = 24 * 60;
const minute = z.number().int().nonnegative();
const actor = z.enum(["passenger", "driver"]);
const statement = z.strictObject({ outcome: z.enum(["completed", "not-completed"]), minute });
export const journeySchema = z.strictObject({
  departure: z.strictObject({ minute, boarded: z.boolean() }).nullable(),
  driverStatement: statement.nullable(),
  passengerStatement: statement.nullable(),
  cancellation: z.strictObject({ actor, minute }).nullable(),
  obligation: z.strictObject({ paise: z.number().int().positive(), currency: z.literal("INR"), minute, dueMinute: minute }).nullable(),
  claim: z.strictObject({ method: z.enum(["cash", "upi"]), minute }).nullable(),
  receipt: z.strictObject({ minute }).nullable(),
  dispute: z.strictObject({ minute }).nullable(),
  review: z.strictObject({ reason: z.enum(["not-boarded", "journey-disagreement", "journey-silence", "payment-dispute", "receipt-silence", "interruption"]), actor: z.enum(["passenger", "driver", "clock"]), minute }).nullable(),
});
export const journeyActions = [
  z.strictObject({ type: z.literal("depart"), boarded: z.boolean() }),
  z.strictObject({ type: z.literal("cancel-trip") }),
  z.strictObject({ type: z.literal("report-interruption") }),
  z.strictObject({ type: z.literal("state-journey"), outcome: z.enum(["completed", "not-completed"]) }),
  z.strictObject({ type: z.literal("claim-payment"), method: z.enum(["cash", "upi"]) }),
  z.strictObject({ type: z.literal("respond-payment"), response: z.enum(["received", "disputed"]) }),
] as const;
const actionSchema = z.discriminatedUnion("type", journeyActions);
export type Journey = z.infer<typeof journeySchema>;
type JourneyAction = z.infer<typeof actionSchema>;
type Context = { minute: number; role: "passenger" | "driver"; acceptedMinute: number; paise: number };
export const emptyJourney = (): Journey => ({ departure: null, driverStatement: null, passengerStatement: null, cancellation: null, obligation: null, claim: null, receipt: null, dispute: null, review: null });

/** Only explicit clock movement opens timeout reviews. It never supplies a statement or receipt. */
export function advanceJourney(j: Journey, now: number): Journey {
  if (j.review || j.cancellation || j.receipt) return j;
  if (j.claim && now >= j.claim.minute + RESPONSE_WINDOW) {
    return { ...j, review: { reason: "receipt-silence", actor: "clock", minute: j.claim.minute + RESPONSE_WINDOW } };
  }
  const first = j.driverStatement ?? j.passengerStatement;
  if (first && !(j.driverStatement && j.passengerStatement) && now >= first.minute + RESPONSE_WINDOW) {
    return { ...j, review: { reason: "journey-silence", actor: "clock", minute: first.minute + RESPONSE_WINDOW } };
  }
  return j;
}

/** A pure transition: null rejects; the original object is a successful exact retry. */
export function transitionJourney(j: Journey, action: JourneyAction, c: Context): Journey | null {
  const now = c.minute;
  switch (action.type) {
    case "depart":
      if (c.role !== "driver") return null;
      if (j.departure) return j.departure.boarded === action.boarded ? j : null;
      if (j.cancellation || j.review || now < DEPARTURE_OPEN || now >= DEPARTURE_CLOSE) return null;
      return { ...j, departure: { minute: now, boarded: action.boarded }, review: action.boarded ? null : { reason: "not-boarded", actor: "driver", minute: now } };
    case "cancel-trip":
      if (j.cancellation) return j.cancellation.actor === c.role ? j : null;
      if (j.departure || j.review) return null;
      return { ...j, cancellation: { actor: c.role, minute: now } };
    case "report-interruption":
      if (j.review?.reason === "interruption" && j.review.actor === c.role) return j;
      if (!j.departure || j.review || j.obligation || j.cancellation) return null;
      return { ...j, review: { reason: "interruption", actor: c.role, minute: now } };
    case "state-journey": {
      const key = c.role === "driver" ? "driverStatement" : "passengerStatement";
      if (j[key]) return j[key].outcome === action.outcome ? j : null;
      if (!j.departure?.boarded || j.cancellation || j.review) return null;
      const next = { ...j, [key]: { outcome: action.outcome, minute: now } };
      if (action.outcome === "not-completed") return { ...next, review: { reason: "journey-disagreement", actor: c.role, minute: now } };
      if (next.driverStatement?.outcome === "completed" && next.passengerStatement?.outcome === "completed") {
        return { ...next, obligation: { paise: c.paise, currency: "INR", minute: now, dueMinute: now + RESPONSE_WINDOW } };
      }
      return next;
    }
    case "claim-payment":
      if (c.role !== "passenger") return null;
      if (j.claim) return j.claim.method === action.method ? j : null;
      if (!j.obligation || j.review || j.cancellation) return null;
      return { ...j, claim: { method: action.method, minute: now } };
    case "respond-payment":
      if (c.role !== "driver") return null;
      if (j.receipt || j.dispute) return (j.receipt ? action.response === "received" : action.response === "disputed") ? j : null;
      if (!j.claim || j.review) return null;
      return action.response === "received" ? { ...j, receipt: { minute: now } } : { ...j, dispute: { minute: now }, review: { reason: "payment-dispute", actor: "driver", minute: now } };
  }
}

/** Reject internally contradictory persisted simulator records, not authenticate a browser user. */
export function validJourney(j: Journey, c: Omit<Context, "role"> | null, now: number): boolean {
  if (!c) return Object.values(j).every(value => value === null);
  for (const value of Object.values(j)) if (value && (value.minute < c.acceptedMinute || value.minute > now)) return false;
  const d = j.departure, ds = j.driverStatement, ps = j.passengerStatement, o = j.obligation;
  if (j.cancellation) return !d && !ds && !ps && !o && !j.claim && !j.receipt && !j.dispute && !j.review;
  if (d && (d.minute < DEPARTURE_OPEN || d.minute >= DEPARTURE_CLOSE)) return false;
  if ((ds || ps) && !d?.boarded) return false;
  if ((ds && ds.minute < d!.minute) || (ps && ps.minute < d!.minute)) return false;
  const agreed = ds?.outcome === "completed" && ps?.outcome === "completed";
  if (ds && ps && Math.abs(ds.minute - ps.minute) >= RESPONSE_WINDOW) return false;
  if (Boolean(o) !== agreed) return false;
  if (o && (o.paise !== c.paise || o.minute !== Math.max(ds!.minute, ps!.minute) || o.dueMinute !== o.minute + RESPONSE_WINDOW)) return false;
  if (j.claim && (!o || j.claim.minute < o.minute)) return false;
  if (j.receipt && (!j.claim || j.receipt.minute < j.claim.minute || j.receipt.minute >= j.claim.minute + RESPONSE_WINDOW || j.review || j.dispute)) return false;
  if (j.dispute && (!j.claim || j.dispute.minute < j.claim.minute || j.dispute.minute >= j.claim.minute + RESPONSE_WINDOW || j.review?.reason !== "payment-dispute")) return false;
  const r = j.review;
  if (r) {
    if (!d || r.minute < d.minute) return false;
    switch (r.reason) {
      case "not-boarded": if (d.boarded || r.actor !== "driver" || r.minute !== d.minute || o) return false; break;
      case "journey-disagreement": {
        const s = r.actor === "driver" ? ds : r.actor === "passenger" ? ps : null;
        if (s?.outcome !== "not-completed" || r.minute !== s.minute || o) return false; break;
      }
      case "journey-silence": {
        const first = ds ?? ps;
        if (!first || agreed || (ds && ps) || r.actor !== "clock" || r.minute !== first.minute + RESPONSE_WINDOW || o) return false; break;
      }
      case "payment-dispute": if (!j.dispute || r.actor !== "driver" || r.minute !== j.dispute.minute) return false; break;
      case "receipt-silence": if (!j.claim || j.receipt || j.dispute || r.actor !== "clock" || r.minute !== j.claim.minute + RESPONSE_WINDOW) return false; break;
      case "interruption": if (o || r.actor === "clock") return false; break;
    }
  } else if ((d && !d.boarded) || ds?.outcome === "not-completed" || ps?.outcome === "not-completed") return false;
  return advanceJourney(j, now) === j;
}
