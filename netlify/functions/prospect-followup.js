const { schedule } = require("@netlify/functions");

const SUPABASE_URL = "https://ltveorvqvvlyivjwxjlc.supabase.co";

const sbHeaders = (key) => ({
  "Content-Type": "application/json",
  apikey: key,
  Authorization: `Bearer ${key}`,
});

async function sendEmail(to, subject, body, resendKey) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: "David Espinoza <equipo@stryvstudio.com>",
      reply_to: "stryv.studio@gmail.com",
      to: [to],
      subject: subject,
      text: body,
      html: body.replace(/\n/g, "<br>"),
    }),
  });
  return res.json();
}

async function getProspectsForFollowup(sbKey) {
  const now = new Date();

  // Get prospects that are "Contactado" (V1 sent) — need V2 after 3 days
  const threeDaysAgo = new Date(now - 3 * 86400000).toISOString();
  const res1 = await fetch(
    `${SUPABASE_URL}/rest/v1/prospects?stage=eq.Contactado&emails_sent=eq.1&created_at=lte.${threeDaysAgo}&select=*&limit=50`,
    { headers: sbHeaders(sbKey) }
  );
  const needV2 = await res1.json();

  // Get prospects that got V2 — need V3 after 7 days from creation
  const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString();
  const res2 = await fetch(
    `${SUPABASE_URL}/rest/v1/prospects?stage=eq.Contactado&emails_sent=eq.2&created_at=lte.${sevenDaysAgo}&select=*&limit=50`,
    { headers: sbHeaders(sbKey) }
  );
  const needV3 = await res2.json();

  return { needV2: Array.isArray(needV2) ? needV2 : [], needV3: Array.isArray(needV3) ? needV3 : [] };
}

async function updateProspect(id, data, sbKey) {
  await fetch(`${SUPABASE_URL}/rest/v1/prospects?id=eq.${id}`, {
    method: "PATCH",
    headers: sbHeaders(sbKey),
    body: JSON.stringify(data),
  });
}

async function runFollowups() {
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const RESEND_KEY = process.env.RESEND_API_KEY;

  if (!SB_KEY || !RESEND_KEY) {
    console.log("Missing keys");
    return { error: "Missing SUPABASE_SERVICE_KEY or RESEND_API_KEY" };
  }

  const { needV2, needV3 } = await getProspectsForFollowup(SB_KEY);
  const results = { v2Sent: 0, v3Sent: 0, errors: [] };

  console.log(`Follow-up: ${needV2.length} need V2, ${needV3.length} need V3`);

  // Send V2
  for (const p of needV2) {
    try {
      if (!p.email || !p.subject_v2 || !p.email_v2) continue;
      const sendResult = await sendEmail(p.email, p.subject_v2, p.email_v2, RESEND_KEY);
      if (sendResult.id) {
        await updateProspect(p.id, { emails_sent: 2 }, SB_KEY);
        results.v2Sent++;
        console.log(`V2 sent to ${p.business} (${p.email})`);
      }
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      results.errors.push(`V2 ${p.business}: ${err.message}`);
    }
  }

  // Send V3
  for (const p of needV3) {
    try {
      if (!p.email || !p.subject_v3 || !p.email_v3) continue;
      const sendResult = await sendEmail(p.email, p.subject_v3, p.email_v3, RESEND_KEY);
      if (sendResult.id) {
        await updateProspect(p.id, { emails_sent: 3 }, SB_KEY);
        results.v3Sent++;
        console.log(`V3 sent to ${p.business} (${p.email})`);
      }
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      results.errors.push(`V3 ${p.business}: ${err.message}`);
    }
  }

  console.log("Follow-up done:", JSON.stringify(results));
  return results;
}

// Runs every 12 hours
exports.handler = schedule("0 */12 * * *", async () => {
  const results = await runFollowups();
  return { statusCode: 200, body: JSON.stringify(results) };
});
