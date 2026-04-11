const SUPABASE_URL = "https://ltveorvqvvlyivjwxjlc.supabase.co";

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" }, body: "" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const type = body.type;
    const emailId = body.data?.email_id;

    console.log(`Resend webhook: ${type} for ${emailId}`);

    if (!emailId) return { statusCode: 200, body: "No email_id" };

    const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
    if (!SB_KEY) return { statusCode: 200, body: "No SB key" };

    const headers = {
      "Content-Type": "application/json",
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
    };

    if (type === "email.opened") {
      // Mark prospect as opened
      await fetch(`${SUPABASE_URL}/rest/v1/prospects?resend_id=eq.${emailId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ email_opened: true, email_opened_at: new Date().toISOString() }),
      });
      console.log(`Marked as opened: ${emailId}`);
    }

    if (type === "email.bounced") {
      await fetch(`${SUPABASE_URL}/rest/v1/prospects?resend_id=eq.${emailId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ stage: "Descartado", notes: "Email bounced" }),
      });
      console.log(`Marked as bounced: ${emailId}`);
    }

    if (type === "email.complained") {
      await fetch(`${SUPABASE_URL}/rest/v1/prospects?resend_id=eq.${emailId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ stage: "Descartado", notes: "Spam complaint" }),
      });
      console.log(`Marked as complained: ${emailId}`);
    }

    return { statusCode: 200, body: "OK" };
  } catch (err) {
    console.error("Webhook error:", err.message);
    return { statusCode: 200, body: "Error handled" };
  }
};
