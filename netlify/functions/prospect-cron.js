const { schedule } = require("@netlify/functions");

exports.handler = schedule("@daily", async () => {
  const siteUrl = process.env.URL || "https://adminstryv.netlify.app";
  try {
    const res = await fetch(`${siteUrl}/.netlify/functions/prospect-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useDb: true, limit: 30 }),
    });
    const data = await res.json();
    console.log("Cron agent results:", JSON.stringify(data));
    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (err) {
    console.error("Cron error:", err.message);
    return { statusCode: 500, body: err.message };
  }
});
