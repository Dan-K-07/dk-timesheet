/* =====================================================================
   DK Jobs - AI receipt scanning (Supabase Edge Function "scan-receipt")

   The app uploads a receipt to your private "receipts" bucket, then calls
   this function with its path. The function reads the file (as you - it
   can only open files in your own folder), asks Claude to read it, and
   sends back the date, supplier, total, VAT, category and description.
   Your Anthropic API key stays here as a Supabase secret - it never goes
   to the browser.

   HOW TO SET IT UP (once, about 10 minutes):
   1. Get an Anthropic API key: https://console.anthropic.com
      -> Settings -> API keys -> Create key. Add some credit under Billing
      (a receipt costs roughly 1-3p - see "Cost" below).
   2. In Supabase: your project -> Edge Functions -> Secrets -> Add new
      secret. Name: ANTHROPIC_API_KEY   Value: the key from step 1.
   3. Edge Functions -> Deploy a new function -> Via Editor.
      Name it exactly: scan-receipt
      Replace the example code with everything in this file, then Deploy.
      (Leave "Verify JWT" switched ON - only signed-in users can call it.)
   4. That's it. In DK Jobs, Add Expense -> Upload Receipt now scans.
      To update it later, open the function in the dashboard, paste the
      new version and Deploy again.

   Cost: Claude Opus 5.5 at $4 / $20 per million input / output tokens. A
   receipt photo or one-page PDF is about 2,000-3,500 input tokens plus a
   few hundred output tokens - roughly $0.01-0.03 (1-2p) per receipt.
   ===================================================================== */

import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const MODEL = "claude-opus-5-5";
const BUCKET = "receipts";
const MAX_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return reply(500, { error: "ANTHROPIC_API_KEY secret is not set" });

  // Act as the signed-in user, so storage rules only let us read their files.
  const auth = req.headers.get("Authorization") || "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return reply(401, { error: "Not signed in" });

  let body: { path?: string; categories?: string[] };
  try { body = await req.json(); } catch { return reply(400, { error: "Bad request" }); }
  const path = String(body.path || "");
  if (!path.startsWith(user.id + "/")) return reply(403, { error: "That receipt isn't yours" });
  const categories = (Array.isArray(body.categories) ? body.categories : [])
    .map((c) => String(c).trim()).filter(Boolean).slice(0, 60);

  const { data: file, error: dlError } = await supabase.storage.from(BUCKET).download(path);
  if (dlError || !file) return reply(404, { error: "Couldn't open the receipt" });
  if (file.size > MAX_BYTES) return reply(413, { error: "Receipt file is too large to scan" });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const data = encodeBase64(bytes);
  const type = (file.type || "").toLowerCase();
  const isPdf = type === "application/pdf" || /\.pdf$/i.test(path) || (bytes[0] === 0x25 && bytes[1] === 0x50);
  let receiptBlock: Anthropic.Beta.Messages.BetaContentBlockParam;
  if (isPdf) {
    receiptBlock = { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  } else {
    const mediaType = IMAGE_TYPES.includes(type) ? type : "image/jpeg";
    receiptBlock = {
      type: "image",
      source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data },
    };
  }

  // The answer has to match this shape exactly (structured outputs).
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["is_receipt", "date", "merchant", "total", "vat", "currency", "category", "description"],
    properties: {
      is_receipt: { type: "boolean", description: "false if this isn't a receipt, invoice or bill" },
      date: { type: "string", description: "Date of purchase as YYYY-MM-DD, or empty string if not shown" },
      merchant: { type: "string", description: "Business that was paid, e.g. 'Screwfix Direct Ltd', or empty string" },
      total: { type: "number", description: "Total amount paid including VAT. Negative for a refund. 0 if unreadable" },
      vat: { type: "number", description: "VAT included in the total, 0 if none shown" },
      currency: { type: "string", description: "ISO currency code, e.g. GBP" },
      category: categories.length
        ? { type: "string", enum: categories, description: "Best matching expense category" }
        : { type: "string", description: "Short expense category, e.g. Travel" },
      description: { type: "string", description: "Short note of what was bought, under 80 characters" },
    },
  };

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system: "You read receipts and invoices for a UK sole trader's business expenses. " +
        "Report what the document actually shows; don't guess numbers. Dates on UK receipts are usually day/month/year. " +
        "Use the amount actually paid as the total (after discounts, including VAT and delivery).",
      messages: [{
        role: "user",
        content: [receiptBlock, { type: "text", text: "Read this receipt and fill in the expense details." }],
      }],
    });

    if (response.stop_reason === "refusal") return reply(422, { error: "The receipt couldn't be read" });
    if (response.stop_reason === "max_tokens") return reply(502, { error: "The scan was cut short - try again" });
    const text = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    let result: Record<string, unknown>;
    try { result = JSON.parse(text); } catch { return reply(502, { error: "The scan didn't come back in the right format" }); }
    return reply(200, { result, model: response.model });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return reply(429, { error: "Too many scans at once - try again in a minute" });
    if (err instanceof Anthropic.AuthenticationError) return reply(500, { error: "The Anthropic API key is wrong or has been revoked" });
    if (err instanceof Anthropic.APIError) return reply(502, { error: "AI service error (" + err.status + ")" });
    return reply(500, { error: "Scan failed" });
  }
});
