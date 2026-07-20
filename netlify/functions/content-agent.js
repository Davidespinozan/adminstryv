const { schedule } = require("@netlify/functions");

const SUPABASE_URL = "https://lxpgqhghxfqsahwrdmzo.supabase.co";

const sbHeaders = (key) => ({
  "Content-Type": "application/json",
  apikey: key,
  Authorization: `Bearer ${key}`,
});

const TOPICS = [
  "AI replacing jobs in small businesses",
  "why most businesses fail at automation",
  "the real cost of not having systems",
  "digital operating systems for local businesses",
  "why your business depends on you and how to fix it",
  "the difference between working IN your business vs ON it",
  "how AI is changing customer service for small businesses",
  "why most CRMs fail small businesses",
  "the future of local commerce vs big tech",
  "building a business that runs without you",
  "what Ray Dalio's principles teach about business operations",
  "geopolitics and how it affects small business owners",
  "the freedom economy — designing your life through systems",
  "why content without systems is just noise",
  "the 48-hour rule — first results or nothing",
  "why most businesses operate like it's 2010",
  "the WhatsApp trap — when your business runs on chat",
  "inventory in Excel is a ticking bomb",
  "your clients don't come back because you don't have a system",
  "the real reason your team can't scale",
];

const CONTENT_PROMPT = (topic) => `Eres la mente de David Espinoza. No un asistente — una mente que procesa el mundo y lo convierte en ideas que provocan, incomodan y despiertan.

Contexto: David es fundador de STRYV (stryvstudio.com), construye sistemas operativos digitales para negocios. Vive en Valencia, España. Piensa en ciclos históricos, geopolítica, economía real, comportamiento humano. Lee a Dalio, Huntington, Zeihan. Es pro-libertad — la tecnología es el vehículo.

Audiencia: Dueños de negocio que quieren más. Gente que siente que hay algo más pero no sabe cómo romper su molde.

TEMA: "${topic}"

Genera 3 ideas de contenido en español:

1. VOZ DAVID — personal, filosófica, desde adentro. Pensando en voz alta.
2. VOZ STRYV — negocios, sistemas, operación. El ángulo práctico.
3. COMODÍN — lo que surja naturalmente. Sin forzar.

Cada idea:
- hook: primera línea que detiene el scroll. Sin clickbait barato. Máximo 15 palabras.
- core: la tesis en 2-3 líneas. Con postura, no neutralidad. Algo que la gente quiera compartir.
- cta: qué quieres que sienta, piense o haga. NO "sígueme para más". Algo que provoque acción real.
- format: uno de: Reel, Carrusel, Story, o texto solo.
- pillar: uno de estos 7: "Dueño de negocio", "Sistemas y automatización", "Newsjacking", "El mundo cambia", "Dolor social", "Detrás de cámaras", "Mentalidad"
- caption: copy completo listo para publicar en Instagram. Gancho, desarrollo, CTA. Máximo 300 palabras. Con saltos de línea. Máximo 3 hashtags específicos al final.

Tono: Directo. Natural. Con peso. Sin emojis. Sin "5 tips". Sin motivación de calendario. Como si David hablara en una cena con amigos inteligentes.

RESPONDE SOLO EN JSON sin markdown:
{"ideas":[{"voice":"David","hook":"...","core":"...","cta":"...","format":"...","pillar":"...","caption":"..."},{"voice":"STRYV","hook":"...","core":"...","cta":"...","format":"...","pillar":"...","caption":"..."},{"voice":"Comodín","hook":"...","core":"...","cta":"...","format":"...","pillar":"...","caption":"..."}]}`;

async function getTodayCount(sbKey) {
  const today = new Date().toISOString().split("T")[0];
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/content?created_at=gte.${today}T00:00:00&source=eq.agent&select=id`,
    { headers: { ...sbHeaders(sbKey), Prefer: "count=exact" } }
  );
  const range = res.headers.get("content-range") || "";
  return parseInt(range.split("/")[1] || "0");
}

async function saveIdea(idea, topic, sbKey) {
  await fetch(`${SUPABASE_URL}/rest/v1/content`, {
    method: "POST",
    headers: { ...sbHeaders(sbKey), Prefer: "return=minimal" },
    body: JSON.stringify({
      title: idea.hook,
      pillar: idea.pillar || "Mentalidad",
      format: idea.format === "reel" ? "Reel" : idea.format === "carrusel" ? "Carrusel" : idea.format === "imagen con texto" ? "Story" : "Reel",
      status: "Idea",
      platform: "Instagram",
      notes: `VOZ: ${idea.voice}\n\nCORE: ${idea.core}\n\nCTA: ${idea.cta}\n\nCAPTION:\n${idea.caption||""}\n\nTEMA: ${topic}`,
      source: "agent",
    }),
  });
}

// Runs every 12 hours — generates ~15 ideas per run (5 topics × 3 ideas)
exports.handler = schedule("0 */12 * * *", async () => {
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  if (!SB_KEY || !ANTHROPIC_KEY) {
    return { statusCode: 500, body: "Missing keys" };
  }

  const todayCount = await getTodayCount(SB_KEY);
  if (todayCount >= 50) {
    console.log(`Content agent: already ${todayCount} ideas today, skipping`);
    return { statusCode: 200, body: "Daily limit reached" };
  }

  // Pick 5 random topics
  const shuffled = [...TOPICS].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 5);
  let totalSaved = 0;

  for (const topic of selected) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1500,
          messages: [{ role: "user", content: CONTENT_PROMPT(topic) }],
        }),
      });

      const data = await res.json();
      const raw = data.content?.find((b) => b.type === "text")?.text || "";
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      for (const idea of parsed.ideas || []) {
        await saveIdea(idea, topic, SB_KEY);
        totalSaved++;
      }

      console.log(`Content agent: ${topic} → ${(parsed.ideas || []).length} ideas`);
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.error(`Content agent error for "${topic}":`, err.message);
    }
  }

  console.log(`Content agent done: ${totalSaved} ideas saved`);
  return { statusCode: 200, body: `${totalSaved} ideas saved` };
});
