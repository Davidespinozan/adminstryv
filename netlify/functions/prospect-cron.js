const { schedule } = require("@netlify/functions");

exports.handler = schedule("0 */8 * * *", async () => {
  // PAUSED: agent disabled
  const AGENT_PAUSED = true;
  if (AGENT_PAUSED) {
    console.log("Prospect cron PAUSED");
    return { statusCode: 200, body: "Paused" };
  }

  // SEC-2: el background exige X-Internal-Token. Sin la variable, no se invoca.
  // El valor nunca se registra en logs.
  const internalToken = (process.env.INTERNAL_CRON_TOKEN || "").trim();
  if (!internalToken) {
    console.error("Prospect cron: INTERNAL_CRON_TOKEN no configurado; no se invoca el agente");
    return { statusCode: 500, body: "Internal token not configured" };
  }

  const siteUrl = process.env.URL || "https://adminstryv.netlify.app";
  try {
    const res = await fetch(`${siteUrl}/.netlify/functions/prospect-agent-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Token": internalToken },
      body: JSON.stringify({ useDb: true, limit: 10 }),
    });
    console.log("Cron triggered background agent, status:", res.status);
    return { statusCode: 200, body: "Background agent triggered" };
  } catch (err) {
    console.error("Cron error:", err.message);
    return { statusCode: 500, body: err.message };
  }
});
