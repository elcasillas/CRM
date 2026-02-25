import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODEL_ID = "claude-haiku-4-5-20251001";
const MODEL_TAG = "haiku";
const MAX_DEALS_PER_REQUEST = 100;
const MAX_NOTES_CANONICAL_LENGTH = 50_000;

interface CRMDeal {
  deal_id: string;
  notes_hash: string;
  notes_canonical: string;
  dealName: string;
}

async function callClaude(
  apiKey: string,
  dealsList: string,
  dealCount: number
): Promise<Record<string, string>> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL_ID,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `You are summarizing CRM deal notes for a sales dashboard. For each deal below, write a 3-5 sentence summary that covers: (1) current status and stage of the deal, (2) key activities and interactions so far, (3) blockers or risks, and (4) next steps and expected timeline. Be factual and specific—include names, dates, and action items where available.

Return a JSON object where keys are the deal numbers ("1", "2", etc.) and values are the summary strings. You must include all ${dealCount} deals.

${dealsList}`,
        },
        {
          role: "assistant",
          content: "{",
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Claude API error:", response.status, errText);
    throw new Error(`Claude API call failed: ${response.status}`);
  }

  const result = await response.json();
  const rawText = result.content?.[0]?.text || "}";
  const text = "{" + rawText;

  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch { /* fall through */ }
    }
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { deals } = await req.json();

    if (!deals || !Array.isArray(deals) || deals.length === 0) {
      return new Response(
        JSON.stringify({ error: "No deals provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (deals.length > MAX_DEALS_PER_REQUEST) {
      return new Response(
        JSON.stringify({ error: `Too many deals: max ${MAX_DEALS_PER_REQUEST}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    for (let i = 0; i < deals.length; i++) {
      const d = deals[i];
      if (!d.deal_id || typeof d.deal_id !== "string") {
        return new Response(
          JSON.stringify({ error: `deals[${i}].deal_id is required` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!d.notes_hash || typeof d.notes_hash !== "string") {
        return new Response(
          JSON.stringify({ error: `deals[${i}].notes_hash is required` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (typeof d.notes_canonical === "string" && d.notes_canonical.length > MAX_NOTES_CANONICAL_LENGTH) {
        return new Response(
          JSON.stringify({ error: `deals[${i}].notes_canonical exceeds ${MAX_NOTES_CANONICAL_LENGTH} char limit` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const typedDeals = deals as CRMDeal[];
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Check cache for all deal_ids
    const dealIds = typedDeals.map((d) => d.deal_id);
    const { data: cachedRows, error: cacheError } = await admin
      .from("deal_summary_cache")
      .select("deal_id, notes_hash, summary")
      .eq("model", MODEL_TAG)
      .in("deal_id", dealIds);

    if (cacheError) console.error("Cache lookup error:", cacheError);

    const cacheMap = new Map<string, string>();
    for (const row of cachedRows || []) {
      cacheMap.set(`${row.deal_id}||${row.notes_hash}`, row.summary);
    }

    // 2. Split hits vs misses
    const results: { deal_id: string; notes_hash: string; summary: string; cached: boolean }[] = [];
    const misses: CRMDeal[] = [];

    for (const deal of typedDeals) {
      const key = `${deal.deal_id}||${deal.notes_hash}`;
      const cached = cacheMap.get(key);
      if (cached) {
        results.push({ deal_id: deal.deal_id, notes_hash: deal.notes_hash, summary: cached, cached: true });
      } else {
        misses.push(deal);
      }
    }

    console.log(`Cache: ${results.length} hits, ${misses.length} misses`);

    // 3. Call Claude for misses
    if (misses.length > 0) {
      const dealsList = misses.map((d, i) => {
        const noteLines = d.notes_canonical
          .split("\n---\n")
          .map((n: string) => `- ${n.trim()}`)
          .join("\n");
        return `Deal ${i + 1}: "${d.dealName}"\nNotes:\n${noteLines}`;
      }).join("\n\n");

      const newSummaries = await callClaude(apiKey, dealsList, misses.length);
      const rowsToInsert: { deal_id: string; notes_hash: string; model: string; summary: string }[] = [];

      for (let i = 0; i < misses.length; i++) {
        const deal = misses[i];
        const summary = newSummaries[String(i + 1)] || "";
        results.push({ deal_id: deal.deal_id, notes_hash: deal.notes_hash, summary, cached: false });
        if (summary) {
          rowsToInsert.push({ deal_id: deal.deal_id, notes_hash: deal.notes_hash, model: MODEL_TAG, summary });
        }
      }

      if (rowsToInsert.length > 0) {
        const { error: insertError } = await admin
          .from("deal_summary_cache")
          .upsert(rowsToInsert, { onConflict: "deal_id,notes_hash,model" });
        if (insertError) console.error("Cache insert error:", insertError);
      }
    }

    return new Response(JSON.stringify({ summaries: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
