const SUPABASE_URL = "https://ltveorvqvvlyivjwxjlc.supabase.co";

const sbHeaders = (key) => ({
  "Content-Type": "application/json",
  apikey: key,
  Authorization: `Bearer ${key}`,
});

// ─── Google Places Search ───
async function searchPlaces(query, city, apiKey) {
  const textQuery = `${query} en ${city}`;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.rating,places.userRatingCount,places.types,places.editorialSummary,places.nationalPhoneNumber,places.googleMapsUri,places.primaryType,places.shortFormattedAddress",
    },
    body: JSON.stringify({ textQuery, maxResultCount: 20 }),
  });
  const data = await res.json();
  return (data.places || []).map((p) => ({
    googlePlaceId: p.id,
    name: p.displayName?.text || "",
    business: p.displayName?.text || "",
    city: city,
    address: p.formattedAddress || "",
    shortAddress: p.shortFormattedAddress || "",
    url: p.websiteUri || "",
    phone: p.nationalPhoneNumber || "",
    googleCategory: p.primaryType ? p.primaryType.replace(/_/g, " ") : (p.types || []).slice(0, 3).join(", "),
    googleTypes: (p.types || []).slice(0, 5).join(", "),
    googleDescription: p.editorialSummary?.text || "",
    googleRating: p.rating || null,
    googleReviews: p.userRatingCount || 0,
    googleMapsUrl: p.googleMapsUri || "",
  }));
}

// ─── Fetch a single page ───
async function fetchPage(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; STRYVBot/1.0)" },
    });
    clearTimeout(timeout);
    if (!res.ok) return "";
    return await res.text();
  } catch { return ""; }
}

// ─── Blocked email patterns (bounce-prone) ───
const BLOCKED_PREFIXES = ["noreply","no-reply","no_reply","donotreply","mailer-daemon","postmaster","abuse","spam","bounce","unsubscribe","newsletter","notifications","alert","system","webmaster","hostmaster","security","privacy","compliance","root"];
const BLOCKED_DOMAINS = ["example.com","test.com","sentry.io","wixpress.com","wordpress.com","squarespace.com","godaddy.com","shopify.com","mailchimp.com","sendgrid.net","amazonaws.com"];
const BLOCKED_PATTERNS = [".png",".jpg",".jpeg",".webp",".gif",".svg",".css",".js",".woff",".ttf",".ico","@2x","@3x","%20","%40"];

// ─── Extract and validate emails from HTML ───
function extractEmails(html) {
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const found = [...new Set(html.match(emailRegex) || [])];
  return found.filter(e => {
    const lower = e.toLowerCase();
    const prefix = lower.split("@")[0];
    const domain = lower.split("@")[1];
    if (lower.length > 60 || lower.length < 6) return false;
    if (BLOCKED_PREFIXES.some(bp => prefix === bp || prefix.startsWith(bp + "+"))) return false;
    if (BLOCKED_DOMAINS.some(bd => domain === bd || domain.endsWith("." + bd))) return false;
    if (domain.includes(".edu.") || domain.endsWith(".edu") || domain.includes(".gob.") || domain.endsWith(".gob") || domain.includes(".gov.") || domain.endsWith(".gov")) return false;
    if (BLOCKED_PATTERNS.some(bp => lower.includes(bp))) return false;
    // Must have valid TLD
    const tld = domain.split(".").pop();
    if (tld.length < 2 || tld.length > 10) return false;
    return true;
  });
}

// ─── Validate email is likely real (DNS MX check) ───
async function validateEmail(email) {
  if (!email) return false;
  const domain = email.split("@")[1];
  try {
    const res = await fetch(`https://dns.google/resolve?name=${domain}&type=MX`);
    const data = await res.json();
    if (data.Answer && data.Answer.length > 0) return true;
    // Fallback: check A record (some domains receive mail without MX)
    const res2 = await fetch(`https://dns.google/resolve?name=${domain}&type=A`);
    const data2 = await res2.json();
    return data2.Answer && data2.Answer.length > 0;
  } catch {
    return true;
  }
}

// ─── Prioritize business emails over generic ones ───
function pickBestEmail(emails) {
  if (emails.length === 0) return null;
  // Prefer: contacto@, info@, hola@, ventas@ > random personal emails
  const priority = ["contacto","info","hola","ventas","contact","hello","hi","reservas","reservaciones","citas","atencion"];
  for (const p of priority) {
    const match = emails.find(e => e.toLowerCase().startsWith(p + "@"));
    if (match) return match;
  }
  // Then prefer emails with the business domain (not gmail/hotmail)
  const businessEmails = emails.filter(e => {
    const domain = e.split("@")[1].toLowerCase();
    return !["gmail.com","hotmail.com","yahoo.com","outlook.com","icloud.com","protonmail.com","live.com","aol.com"].includes(domain);
  });
  if (businessEmails.length > 0) return businessEmails[0];
  return emails[0];
}

// ─── Extract Instagram handle from HTML ───
function extractInstagram(html) {
  const patterns = [
    /(?:instagram\.com|instagr\.am)\/([a-zA-Z0-9._]{1,30})\/?/gi,
    /(?:@)([a-zA-Z0-9._]{1,30})/g
  ];
  const found = new Set();
  for (const p of patterns) {
    let match;
    while ((match = p.exec(html)) !== null) {
      const handle = match[1].toLowerCase();
      if (!["p","reel","stories","explore","accounts","about","developer","legal","privacy","terms","help"].includes(handle) && handle.length > 2) {
        found.add(handle);
      }
    }
  }
  // Return first Instagram-specific match (from instagram.com URL)
  const igUrls = [...html.matchAll(/instagram\.com\/([a-zA-Z0-9._]{1,30})\/?/gi)];
  if (igUrls.length > 0) return "@" + igUrls[0][1].toLowerCase();
  return found.size > 0 ? "@" + [...found][0] : null;
}

// ─── Deep scrape: main page + /contacto, /contact, /about, /nosotros ───
async function scrapeWebsite(url) {
  if (!url) return { email: null, context: "", instagram: null };
  const base = url.replace(/\/+$/, "");
  const pages = [base, base + "/contacto", base + "/contact", base + "/about", base + "/nosotros"];
  let allEmails = [];
  let context = "";
  let instagram = null;

  for (const page of pages) {
    const html = await fetchPage(page);
    if (!html) continue;
    allEmails.push(...extractEmails(html));
    if (!instagram) instagram = extractInstagram(html);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    if (titleMatch && !context.includes(titleMatch[1])) context += titleMatch[1] + ". ";
    if (descMatch && !context.includes(descMatch[1])) context += descMatch[1] + ". ";
  }

  const uniqueEmails = [...new Set(allEmails)];
  const bestEmail = pickBestEmail(uniqueEmails);
  // Validate MX records
  const isValid = bestEmail ? await validateEmail(bestEmail) : false;
  return { email: isValid ? bestEmail : null, context: context.substring(0, 500), instagram };
}

// ─── Check if prospect exists in Supabase ───
async function prospectExists(googlePlaceId, sbKey) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/prospects?google_place_id=eq.${encodeURIComponent(googlePlaceId)}&select=id`,
    { headers: sbHeaders(sbKey) }
  );
  const data = await res.json();
  return data.length > 0;
}

// ─── Generate emails with Claude via generate.js function (with retry) ───
async function generateEmails(d, anthropicKey, attempt = 1) {
  const siteUrl = process.env.URL || "https://adminstryv.netlify.app";
  try {
    const res = await fetch(`${siteUrl}/.netlify/functions/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "agent", data: d }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    const raw = data.content?.find((b) => b.type === "text")?.text || "";
    if (!raw) throw new Error("Empty response from Claude");
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    if (parsed.skip) return { skip: true, reason: parsed.reason || "Filtered" };
    if (!parsed.emails || parsed.emails.length < 3) throw new Error("Incomplete emails");
    return parsed;
  } catch (err) {
    if (attempt < 2) {
      console.log(`Retry generating for ${d.business}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1000));
      return generateEmails(d, anthropicKey, attempt + 1);
    }
    throw err;
  }
}

// ─── Daily send limit (escalating) ───
// PAUSED: bounce rate at 9.21% — reactivate when fixed
// Change startDate to reactivation date when ready
async function getDailyLimit() {
  const warmupEnd = new Date("2026-04-26");
  const now = new Date();
  if (now < warmupEnd) return 0; // Warmup in progress — no sending
  const daysSinceStart = Math.floor((now - warmupEnd) / 86400000);
  const week = Math.floor(daysSinceStart / 7);
  if (week <= 0) return 50;
  if (week === 1) return 100;
  if (week === 2) return 200;
  if (week === 3) return 500;
  return 1000;
}

async function getSentToday(sbKey) {
  const today = new Date().toISOString().split("T")[0];
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/prospects?stage=eq.Contactado&created_at=gte.${today}T00:00:00&select=id`,
    { headers: { ...sbHeaders(sbKey), Prefer: "count=exact" } }
  );
  const range = res.headers.get("content-range") || "";
  const count = parseInt(range.split("/")[1] || "0");
  console.log(`Sent today: ${count}, range header: ${range}`);
  return count;
}

// ─── Send email via Resend ───
async function sendEmail(to, subject, body, resendKey) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: "David Arturo Espinoza Núñez <equipo@stryvstudio.com>",
      reply_to: "equipo@stryvstudio.com",
      to: [to],
      subject: subject,
      text: body,
      html: body.replace(/\n/g, "<br>"),
    }),
  });
  return res.json();
}

// ─── Create prospect in Supabase ───
async function createProspect(data, sbKey) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/prospects`, {
    method: "POST",
    headers: { ...sbHeaders(sbKey), Prefer: "return=representation" },
    body: JSON.stringify({
      name: data.name,
      business: data.business,
      city: data.city,
      url: data.url,
      phone: data.phone,
      email: data.email || "",
      stage: data.stage || "Sin contactar",
      source: "Agente automático",
      notes: data.googleDescription || "",
      google_place_id: data.googlePlaceId,
      google_maps_url: data.googleMapsUrl,
      google_rating: data.googleRating,
      google_reviews: data.googleReviews,
      google_category: data.googleCategory,
      google_types: data.googleTypes,
      address: data.address,
      subject_v1: data.subjectV1 || "",
      subject_v2: data.subjectV2 || "",
      subject_v3: data.subjectV3 || "",
      inferred_analysis: data.inferredAnalysis || "",
      instagram: data.instagram || "",
      dm_v4: data.dmV4 || "",
      emails_sent: data.emailsSent || 0,
      resend_id: data.resendId || null,
      email_v1: data.emailV1 || "",
      email_v2: data.emailV2 || "",
      email_v3: data.emailV3 || "",
    }),
  });
  return res.json();
}

// ─── Get oldest searches from Supabase ───
async function getSearches(sbKey, limit = 30) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/prospect_searches?active=eq.true&order=last_run.asc.nullsfirst&limit=${limit}`,
    { headers: sbHeaders(sbKey) }
  );
  return res.json();
}

// ─── Update last_run on a search ───
async function updateSearchRun(id, sbKey) {
  await fetch(`${SUPABASE_URL}/rest/v1/prospect_searches?id=eq.${id}`, {
    method: "PATCH",
    headers: sbHeaders(sbKey),
    body: JSON.stringify({ last_run: new Date().toISOString() }),
  });
}

// ─── Process a single search ───
async function processSearch(search, keys, results, processedIds) {
  try {
    const places = await searchPlaces(search.query, search.city, keys.google);
    results.searched += places.length;

    for (const place of places) {
      try {
        if (processedIds.has(place.googlePlaceId)) { results.skipped++; continue; }
        const exists = await prospectExists(place.googlePlaceId, keys.sb);
        if (exists) { results.skipped++; processedIds.add(place.googlePlaceId); continue; }
        processedIds.add(place.googlePlaceId);

        // Deep scrape website for email + context
        if (place.url) {
          const scrapeResult = await scrapeWebsite(place.url);
          if (scrapeResult.email) { place.email = scrapeResult.email; results.emailsScraped++; }
          if (scrapeResult.context) place.websiteContext = scrapeResult.context;
          if (scrapeResult.instagram) place.instagram = scrapeResult.instagram;
        }

        // Generate emails + analysis with Claude
        const emailData = await generateEmails(place, keys.anthropic);
        if (emailData.skip) { console.log(`Skipped by Claude: ${place.business} — ${emailData.reason}`); results.skipped++; continue; }
        const emails = emailData.emails || [];
        place.subjectV1 = emails[0]?.subject || "";
        place.emailV1 = emails[0]?.body || "";
        place.subjectV2 = emails[1]?.subject || "";
        place.emailV2 = emails[1]?.body || "";
        place.subjectV3 = emails[2]?.subject || "";
        place.emailV3 = emails[2]?.body || "";
        place.dmV4 = emails[3]?.body || "";
        place.inferredAnalysis = emailData.analysis || "";

        if (place.email && keys.resend) {
          const limit = await getDailyLimit();
          const sent = await getSentToday(keys.sb);
          console.log(`Email: ${place.email} | Limit: ${sent}/${limit}`);
          if (sent < limit) {
            const sendResult = await sendEmail(place.email, place.subjectV1, place.emailV1, keys.resend);
            console.log(`Send result for ${place.business}:`, JSON.stringify(sendResult));
            if (sendResult.id) { place.stage = "Contactado"; place.emailsSent = 1; place.resendId = sendResult.id; results.emailed++; }
          } else {
            console.log(`Daily limit reached (${sent}/${limit}), skipping send for ${place.business}`);
          }
        } else {
          console.log(`No email for ${place.business}, skipping send`);
        }

        await createProspect(place, keys.sb);
        results.new++;
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        results.errors.push(`${place.business}: ${err.message}`);
      }
    }

    // Update last_run
    if (search.id) await updateSearchRun(search.id, keys.sb);
  } catch (err) {
    results.errors.push(`Search "${search.query} ${search.city}": ${err.message}`);
  }
}

// ─── Main agent logic ───
async function runAgent(searches) {
  const keys = {
    google: process.env.GOOGLE_PLACES_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    resend: process.env.RESEND_API_KEY,
    sb: process.env.SUPABASE_SERVICE_KEY,
  };

  console.log("Agent starting. Keys present:", { google: !!keys.google, anthropic: !!keys.anthropic, resend: !!keys.resend, sb: !!keys.sb });
  if (!keys.google || !keys.anthropic || !keys.sb) {
    console.error("Missing API keys");
    return { error: "Missing API keys (GOOGLE_PLACES_API_KEY, ANTHROPIC_API_KEY, SUPABASE_SERVICE_KEY)" };
  }

  console.log("Processing", searches.length, "searches");
  const results = { searched: 0, new: 0, skipped: 0, emailed: 0, emailsScraped: 0, searchesProcessed: 0, errors: [] };
  const processedIds = new Set();

  for (const search of searches) {
    console.log("Search:", search.query, search.city);
    await processSearch(search, keys, results, processedIds);
    results.searchesProcessed++;
    console.log("Progress:", JSON.stringify(results));
  }

  console.log("Agent done:", JSON.stringify(results));
  return results;
}

// ─── Lock mechanism ───
async function acquireLock(sbKey) {
  // Try to insert lock row — fails if one already exists
  const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_lock`, {
    method: "POST",
    headers: { ...sbHeaders(sbKey), Prefer: "return=representation" },
    body: JSON.stringify({ id: "prospect-agent", started_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    // Check if lock is stale (older than 14 minutes)
    const check = await fetch(`${SUPABASE_URL}/rest/v1/agent_lock?id=eq.prospect-agent&select=started_at`, { headers: sbHeaders(sbKey) });
    const rows = await check.json();
    if (rows.length && rows[0].started_at) {
      const age = Date.now() - new Date(rows[0].started_at).getTime();
      if (age > 14 * 60 * 1000) {
        // Stale lock — release and retry
        await releaseLock(sbKey);
        const retry = await fetch(`${SUPABASE_URL}/rest/v1/agent_lock`, {
          method: "POST",
          headers: { ...sbHeaders(sbKey), Prefer: "return=representation" },
          body: JSON.stringify({ id: "prospect-agent", started_at: new Date().toISOString() }),
        });
        return retry.ok;
      }
    }
    return false;
  }
  return true;
}

async function releaseLock(sbKey) {
  await fetch(`${SUPABASE_URL}/rest/v1/agent_lock?id=eq.prospect-agent`, {
    method: "DELETE",
    headers: sbHeaders(sbKey),
  });
}

// ─── Manual trigger handler ───
async function manualHandler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" }, body: "" };
  }
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  try {
    const locked = await acquireLock(SB_KEY);
    if (!locked) {
      console.log("Agent already running, skipping");
      return { statusCode: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "El agente ya está ejecutándose. Espera a que termine." }) };
    }

    const body = JSON.parse(event.body || "{}");
    console.log("Manual trigger received:", JSON.stringify(body));

    let searches;
    if (body.useDb) {
      searches = await getSearches(SB_KEY, body.limit || 30);
      console.log("Got", searches.length, "searches from DB");
    } else if (body.searches?.length) {
      searches = body.searches;
    } else {
      await releaseLock(SB_KEY);
      return { statusCode: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "No searches provided" }) };
    }

    const results = await runAgent(searches);
    await releaseLock(SB_KEY);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(results),
    };
  } catch (err) {
    await releaseLock(SB_KEY);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message }),
    };
  }
}

exports.handler = manualHandler;
