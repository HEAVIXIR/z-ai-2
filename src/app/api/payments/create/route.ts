import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { parseBig } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { trackError } from "@/lib/error-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* POST /api/payments/create
   --------------------------------
   Auth-required. Creates a PENDING Payment row for the current
   user. Body:
     {
       amount:        string|number  (IRR — required)
       type:          "SUBSCRIPTION" | "FEATURED_LISTING" | "PROMOTION" | "LEAD_FEE" | "INSPECTION_FEE"
       subscriptionId?: string
       gateway?:      "ZARINPAL" | "PAYIR" | "MANUAL"  (default "ZARINPAL")
       trackingCode?: string
       currency?:     string (default "IRR")
     }

   Returns the created payment row (amount serialized as string
   because BigInt isn't JSON-serializable). The actual gateway
   redirect / callback handling is out of scope for FIX-GAPS-2 —
   this endpoint just opens the ledger row. A real integration
   would call the gateway's `createPayment` API here and store
   the gateway-side authority code in `trackingCode`. */
export async function POST(_req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // This legacy endpoint only created a PENDING ledger row from
  // client-supplied amount/type and never contacted a payment provider.
  // Fail closed until a server-priced, idempotent marketplace gateway
  // intent + verified callback flow is implemented.
  return NextResponse.json(
    {
      error: "Marketplace online checkout is not configured. No payment was created.",
      code: "MARKETPLACE_PAYMENT_UNAVAILABLE",
    },
    { status: 503 },
  );
}
