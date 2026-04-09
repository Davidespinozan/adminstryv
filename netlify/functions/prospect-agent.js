const { schedule } = require("@netlify/functions");

const SUPABASE_URL = "https://ltveorvqvvlyivjwxjlc.supabase.co";

const headers = (key) => ({
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
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.rating,places.userRatingCount,places.types,places.editorialSummary,places.nationalPhoneNumber",
    },
    body: JSON.stringify({ textQuery, maxResultCount: 10 }),
  });
  const data = await res.json();
  return (data.places || []).map((p) => ({
    googlePlaceId: p.id,
    name: p.displayName?.text || "",
    business: p.displayName?.text || "",
    city: city,
    url: p.websiteUri || "",
    phone: p.nationalPhoneNumber || "",
    googleCategory: (p.types || []).slice(0, 3).join(", "),
    googleDescription: p.editorialSummary?.text || "",
    googleRating: p.rating || null,
    googleReviews: p.userRatingCount || 0,
    address: p.formattedAddress || "",
  }));
}

// ─── Check if prospect exists in Supabase ───
async function prospectExists(googlePlaceId, sbKey) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/prospects?google_place_id=eq.${encodeURIComponent(googlePlaceId)}&select=id`,
    { headers: headers(sbKey) }
  );
  const data = await res.json();
  return data.length > 0;
}

// ─── Generate emails with Claude (agent mode) ───
async function generateEmails(prospectData, anthropicKey) {
  // Build agent prompt (same as generate.js agent mode)
  const STRYV_CONTEXT = `Eres David Espinoza, fundador de STRYV (stryvstudio.com) — un estudio que construye sistemas operativos digitales para negocios en México y Latinoamérica. Escribes desde Madrid, España.

STRYV ofrece 5 sistemas según lo que el negocio necesite:
1. Sistema de Ventas y Entrega — para negocios que venden online o quieren sistematizar su proceso comercial
2. Sistema de Atención y Soporte — para negocios con muchos mensajes, consultas o casos sin sistema
3. Sistema de Conversión y Retención Local — para negocios físicos que quieren más recurrencia de clientes
4. Sistema de Operación Interna — para negocios con inventario, producción, equipos o procesos internos complejos
5. Sistema de Contenido con IA — para negocios que necesitan generar contenido de forma sistemática

STRYV NO hace: branding, logos, contenido, redes sociales, ni publicidad pagada. Solo construye sistemas operativos digitales.
Los proyectos son por ticket de implementación (no mensualidades). Duran 4 a 6 semanas. Los primeros resultados se ven en 48-72 horas.`;

  const d = prospectData;
  const prompt = `${STRYV_CONTEXT}

PROSPECTO (datos de Google Places — analiza e infiere):
- Nombre del negocio: ${d.business}
- Ciudad: ${d.city || "no especificada"}
- URL: ${d.url || "no proporcionada"}
- Categoría Google: ${d.googleCategory || "no especificada"}
- Descripción Google: ${d.googleDescription || "no proporcionada"}
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
Si hay reseñas/rating, puedes usarlo como gancho positivo ("vi que tus clientes hablan muy bien de ti").

INSTRUCCIONES:
Escribe 3 emails de prospección completamente distintos en tono y ángulo, pero todos desde la misma voz — la de David escribiendo personalmente.

Reglas de tono:
- Suenan como un email que David escribió específicamente para este prospecto, no un template
- Arrancan con "Buen día" o "Hola [nombre]" — nunca menciones la ciudad de David ni la del prospecto en el saludo
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
    headers: { ...headers(sbKey), Prefer: "return=representation" },
    body: JSON.stringify({
      name: data.name,
      business: data.business,
      city: data.city,
      url: data.url,
      phone: data.phone,
      email: data.email || "",
      stage: data.stage || "Sin contactar",
      source: "Agente automático",
      notes: `Google: ${data.googleCategory} | Rating: ${data.googleRating || "N/A"} (${data.googleReviews} reseñas)\n${data.googleDescription || ""}`,
      google_place_id: data.googlePlaceId,
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

// ─── Main agent logic ───
async function runAgent(searches) {
  const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const RESEND_KEY = process.env.RESEND_API_KEY;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!GOOGLE_KEY || !ANTHROPIC_KEY || !SB_KEY) {
    return { error: "Missing API keys" };
  }

  const results = { searched: 0, new: 0, skipped: 0, emailed: 0, errors: [] };

  for (const search of searches) {
    try {
      const places = await searchPlaces(search.query, search.city, GOOGLE_KEY);
      results.searched += places.length;

      for (const place of places) {
        try {
          // Check duplicate
          const exists = await prospectExists(place.googlePlaceId, SB_KEY);
          if (exists) {
            results.skipped++;
            continue;
          }

          // Generate emails with Claude
          const emailData = await generateEmails(place, ANTHROPIC_KEY);
          const emails = emailData.emails || [];

          place.subjectV1 = emails[0]?.subject || "";
          place.emailV1 = emails[0]?.body || "";
          place.subjectV2 = emails[1]?.subject || "";
          place.emailV2 = emails[1]?.body || "";
          place.subjectV3 = emails[2]?.subject || "";
          place.emailV3 = emails[2]?.body || "";

          // Send V1 if we have email and Resend key
          if (place.email && RESEND_KEY) {
            const sendResult = await sendEmail(place.email, place.subjectV1, place.emailV1, RESEND_KEY);
            if (sendResult.id) {
              place.stage = "Contactado";
              results.emailed++;
            }
          }

          // Save to Supabase
          await createProspect(place, SB_KEY);
          results.new++;

          // Small delay to avoid rate limits
          await new Promise((r) => setTimeout(r, 2000));
        } catch (err) {
          results.errors.push(`${place.business}: ${err.message}`);
        }
      }
    } catch (err) {
      results.errors.push(`Search "${search.query} ${search.city}": ${err.message}`);
    }
  }

  return results;
}

// ─── Scheduled handler (runs daily) ───
const scheduledHandler = schedule("@daily", async () => {
  const searchesEnv = process.env.PROSPECT_SEARCHES || "[]";
  let searches;
  try {
    searches = JSON.parse(searchesEnv);
  } catch {
    return { statusCode: 400, body: "Invalid PROSPECT_SEARCHES env var" };
  }
  if (searches.length === 0) {
    return { statusCode: 200, body: "No searches configured" };
  }
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
    const searches = body.searches || [];
    if (searches.length === 0) {
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

// Export both — Netlify uses the scheduled one for cron, manual for HTTP calls
exports.handler = async (event) => {
  // If it's a scheduled invocation, run the scheduled logic
  if (event.headers?.["x-netlify-event"] === "schedule") {
    return scheduledHandler.handler(event);
  }
  // Otherwise it's a manual HTTP call
  return manualHandler(event);
};
