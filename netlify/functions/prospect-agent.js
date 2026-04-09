const { schedule } = require("@netlify/functions");

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

// ─── Scrape email from website ───
async function scrapeEmail(url) {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; STRYVBot/1.0)" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    // Find emails in HTML — exclude common false positives
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const found = [...new Set(html.match(emailRegex) || [])];
    const filtered = found.filter(
      (e) =>
        !e.includes("example.com") &&
        !e.includes("sentry") &&
        !e.includes("wixpress") &&
        !e.includes("wordpress") &&
        !e.includes(".png") &&
        !e.includes(".jpg") &&
        !e.includes(".webp") &&
        !e.endsWith(".js") &&
        !e.endsWith(".css") &&
        e.length < 60
    );
    return filtered[0] || null;
  } catch {
    return null;
  }
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

// ─── Generate emails with Claude (agent mode) ───
async function generateEmails(d, anthropicKey) {
  const prompt = `Eres David Espinoza, fundador de STRYV (stryvstudio.com) — un estudio que construye sistemas operativos digitales para negocios en México y Latinoamérica. Escribes desde Madrid, España.

STRYV ofrece 5 sistemas según lo que el negocio necesite:
1. Sistema de Ventas y Entrega — para negocios que venden online o quieren sistematizar su proceso comercial
2. Sistema de Atención y Soporte — para negocios con muchos mensajes, consultas o casos sin sistema
3. Sistema de Conversión y Retención Local — para negocios físicos que quieren más recurrencia de clientes
4. Sistema de Operación Interna — para negocios con inventario, producción, equipos o procesos internos complejos
5. Sistema de Contenido con IA — para negocios que necesitan generar contenido de forma sistemática

STRYV NO hace: branding, logos, contenido, redes sociales, ni publicidad pagada. Solo construye sistemas operativos digitales.
Los proyectos son por ticket de implementación (no mensualidades). Duran 4 a 6 semanas. Los primeros resultados se ven en 48-72 horas.

PROSPECTO (datos de Google Places — analiza e infiere):
- Nombre del negocio: ${d.business}
- Ciudad: ${d.city || "no especificada"}
- Dirección: ${d.address || "no proporcionada"}
- URL: ${d.url || "no proporcionada"}
- Categoría: ${d.googleCategory || "no especificada"}
- Tipos: ${d.googleTypes || "no especificados"}
- Descripción: ${d.googleDescription || "no proporcionada"}
- Rating: ${d.googleRating || "N/A"} (${d.googleReviews || 0} reseñas)
- Contacto: ${d.name || "dueño/a"}

IMPORTANTE — ANÁLISIS AUTOMÁTICO:
A partir de la categoría, descripción y URL del negocio, TÚ debes inferir:
1. Qué hace este negocio y cuál es su actividad principal
2. Cómo probablemente vende (presencial, online, WhatsApp, redes, etc.)
3. Qué entrega (servicio, producto, consultoría, etc.)
4. Cómo opera probablemente (tamaño del equipo, tipo de operación)
5. Cuál es el problema más probable que tiene basado en su tipo de negocio

Usa esas inferencias para escribir emails que suenen como si David hubiera investigado el negocio personalmente.
Si hay URL, menciona algo específico que hayas "notado" en su presencia digital.
Si hay reseñas/rating, puedes usarlo como gancho positivo.

INSTRUCCIONES:
Escribe 3 emails de prospección completamente distintos en tono y ángulo.

Reglas de tono:
- Suenan como un email que David escribió específicamente para este prospecto, no un template
- Arrancan con "Buen día" o "Hola" — nunca menciones la ciudad de David ni la del prospecto en el saludo
- Nunca suena a plantilla de ventas — es conversacional, directo, sin exageraciones
- Menciona los sistemas de STRYV que aplican de forma natural dentro del texto, no como lista
- El CTA es siempre una invitación a platicar 20 minutos, sin presión
- Firma siempre: David Espinoza / STRYV · Sistemas Operativos Digitales / stryvstudio.com

Los 3 emails deben tener:
- V1: tono personal y observacional — abre con algo específico que notó del negocio
- V2: tono cercano y conversacional — como alguien que tiene una idea y quiere compartirla
- V3: muy corto — una sola observación o pregunta incómoda, sin pitch largo

Responde SOLO en este formato JSON (sin markdown, sin explicaciones):
{"emails":[{"subject":"...","body":"..."},{"subject":"...","body":"..."},{"subject":"...","body":"..."}]}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  const raw = data.content?.find((b) => b.type === "text")?.text || "";
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
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
      from: "David Espinoza <equipo@stryvstudio.com>",
      reply_to: "stryv.studio@gmail.com",
      to: [to],
      subject: subject,
      text: body,
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
async function processSearch(search, keys, results) {
  try {
    const places = await searchPlaces(search.query, search.city, keys.google);
    results.searched += places.length;

    for (const place of places) {
      try {
        const exists = await prospectExists(place.googlePlaceId, keys.sb);
        if (exists) { results.skipped++; continue; }

        if (place.url) {
          const scraped = await scrapeEmail(place.url);
          if (scraped) { place.email = scraped; results.emailsScraped++; }
        }

        const emailData = await generateEmails(place, keys.anthropic);
        const emails = emailData.emails || [];
        place.subjectV1 = emails[0]?.subject || "";
        place.emailV1 = emails[0]?.body || "";
        place.subjectV2 = emails[1]?.subject || "";
        place.emailV2 = emails[1]?.body || "";
        place.subjectV3 = emails[2]?.subject || "";
        place.emailV3 = emails[2]?.body || "";

        if (place.email && keys.resend) {
          const sendResult = await sendEmail(place.email, place.subjectV1, place.emailV1, keys.resend);
          if (sendResult.id) { place.stage = "Contactado"; results.emailed++; }
        }

        await createProspect(place, keys.sb);
        results.new++;
        await new Promise((r) => setTimeout(r, 2000));
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

  if (!keys.google || !keys.anthropic || !keys.sb) {
    return { error: "Missing API keys (GOOGLE_PLACES_API_KEY, ANTHROPIC_API_KEY, SUPABASE_SERVICE_KEY)" };
  }

  const results = { searched: 0, new: 0, skipped: 0, emailed: 0, emailsScraped: 0, searchesProcessed: 0, errors: [] };

  for (const search of searches) {
    await processSearch(search, keys, results);
    results.searchesProcessed++;
  }

  return results;
}

// ─── Scheduled handler (runs daily) — takes 30 oldest searches from DB ───
const scheduledHandler = schedule("@daily", async () => {
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return { statusCode: 500, body: "Missing SUPABASE_SERVICE_KEY" };

  const searches = await getSearches(SB_KEY, 30);
  if (!searches.length) return { statusCode: 200, body: "No active searches" };

  const results = await runAgent(searches);
  console.log("Agent results:", JSON.stringify(results));
  return { statusCode: 200, body: JSON.stringify(results) };
});

// ─── Manual trigger handler ───
async function manualHandler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" }, body: "" };
  }
  try {
    const body = JSON.parse(event.body || "{}");
    const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

    let searches;
    if (body.useDb) {
      // Run from DB searches
      searches = await getSearches(SB_KEY, body.limit || 30);
    } else if (body.searches?.length) {
      // Run specific searches (from dashboard input)
      searches = body.searches;
    } else {
      return { statusCode: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "No searches provided" }) };
    }

    const results = await runAgent(searches);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(results),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message }),
    };
  }
}

exports.handler = async (event) => {
  if (event.headers?.["x-netlify-event"] === "schedule") {
    return scheduledHandler.handler(event);
  }
  return manualHandler(event);
};
