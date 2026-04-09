const { schedule } = require("@netlify/functions");

exports.handler = schedule("@daily", async () => {
  const siteUrl = process.env.URL || "https://adminstryv.netlify.app";
  try {
    const res = await fetch(`${siteUrl}/.netlify/functions/prospect-agent-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useDb: true, limit: 10 }),
    });
    console.log("Cron triggered background agent, status:", res.status);
    return { statusCode: 200, body: "Background agent triggered" };
  } catch (err) {
    console.error("Cron error:", err.message);
    return { statusCode: 500, body: err.message };
  }
});
