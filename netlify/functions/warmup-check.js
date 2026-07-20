const { schedule } = require("@netlify/functions");

const SUPABASE_URL = "https://lxpgqhghxfqsahwrdmzo.supabase.co";

exports.handler = schedule("0 6 * * *", async () => {
  const warmupEnd = new Date("2026-04-26");
  const now = new Date();

  // Only run on the warmup end date
  if (now.toISOString().split("T")[0] !== "2026-04-26") {
    return { statusCode: 200, body: "Not warmup end date yet" };
  }

  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return { statusCode: 500, body: "No SB key" };

  const headers = {
    "Content-Type": "application/json",
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
  };

  try {
    // Delete bounced prospects
    await fetch(`${SUPABASE_URL}/rest/v1/prospects?stage=eq.Descartado&notes=like.*bounced*`, {
      method: "DELETE",
      headers,
    });

    // Reset contacted prospects to re-send
    await fetch(`${SUPABASE_URL}/rest/v1/prospects?stage=eq.Contactado&email=neq.`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        stage: "Sin contactar",
        emails_sent: 0,
        email_opened: false,
        email_opened_at: null,
        resend_id: null,
      }),
    });

    // Clear lock
    await fetch(`${SUPABASE_URL}/rest/v1/agent_lock?id=eq.prospect-agent`, {
      method: "DELETE",
      headers,
    });

    console.log("Warmup complete! Prospects reset and ready to re-send.");
    return { statusCode: 200, body: "Reset complete" };
  } catch (err) {
    console.error("Warmup check error:", err.message);
    return { statusCode: 500, body: err.message };
  }
});
