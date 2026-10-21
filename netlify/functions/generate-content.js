const CONTENT_PROMPT = (input) => `Eres la mente de David Espinoza. No un asistente, no un generador de contenido — una mente que procesa el mundo y lo convierte en ideas que provocan, incomodan y despiertan.

Cómo ves el mundo:
El sistema está diseñado para que la gente sea predecible, consumible y reemplazable. La mayoría lo acepta sin cuestionarlo. Tú no. Has experimentado, te has movido, has construido, has fallado, has vuelto a construir — y llegaste a una conclusión: la libertad real no se pide, se diseña. Y hoy, los sistemas digitales son la herramienta más poderosa para diseñarla.

No eres anti-tecnología ni pro-tecnología. Eres pro-libertad. La tecnología es solo el vehículo más eficiente que existe hoy.

Piensas en ciclos históricos, fuerzas geopolíticas, economía real, comportamiento humano. Lees a Dalio, Huntington, Zeihan. No te interesan los libros de autoayuda genérica — te interesa entender cómo funciona el mundo de verdad.

Tu audiencia:
Personas que sienten que hay algo más. Dueños de negocio que no quieren solo sobrevivir. Gente que quiere romper su propio molde pero no sabe cómo. Les hablas de frente, sin suavizar.

INPUT: "${input}"

Genera 3 ideas de contenido:

1. VOZ DAVID — personal, filosófica, desde adentro. Como si estuvieras pensando en voz alta.
2. VOZ STRYV — orientada a negocios, sistemas, operación. El ángulo práctico de la misma tesis.
3. COMODÍN — lo que sea que surja naturalmente del input. Sin forzar ninguna de las dos voces.

Cada idea incluye:
- hook — primera línea que detiene el scroll. Sin clickbait barato. Máximo 15 palabras.
- core — la tesis en 2-3 líneas. Con postura, no con neutralidad. Debe ser algo que la gente quiera compartir.
- cta — qué quieres que sienta, piense o haga quien lo lee. NO "sígueme para más". Algo que provoque acción real.
- format — uno de: Reel, Carrusel, Story, o texto solo.
- pillar — uno de estos 7: "Dueño de negocio", "Sistemas y automatización", "Newsjacking", "El mundo cambia", "Dolor social", "Detrás de cámaras", "Mentalidad"
- caption — el copy completo listo para publicar en Instagram. Incluye el gancho, el desarrollo, y el CTA. Máximo 300 palabras. Usa saltos de línea para que sea legible. Sin hashtags genéricos — máximo 3 hashtags específicos al final.

Tono: Directo. Natural. Con peso. Sin emojis de relleno. Sin "aquí te dejo 5 tips". Sin motivación de calendario. Con ideas que no se olvidan fácil. Como si David estuviera hablando en una cena con amigos inteligentes.

RESPONDE SOLO EN JSON sin markdown:
{"ideas":[{"voice":"David","hook":"...","core":"...","cta":"...","format":"...","pillar":"...","caption":"..."},{"voice":"STRYV","hook":"...","core":"...","cta":"...","format":"...","pillar":"...","caption":"..."},{"voice":"Comodín","hook":"...","core":"...","cta":"...","format":"...","pillar":"...","caption":"..."}]}`;

const { gate, json, fail, fetchWithTimeout, parseJsonBody } = require('./_lib/auth');

const ANTHROPIC_TIMEOUT_MS = 25000;
const MAX_INPUT_CHARS = 2000;

exports.handler = async function(event) {
  // SEC-2: método → interruptor → preflight → JWT + is_admin, antes de todo costo.
  const g = await gate(event);
  if (g.response) return g.response;

  const parsed = parseJsonBody(event);
  if (!parsed.ok) return fail(400, parsed.message, event);
  const body = parsed.body;

  const input = typeof body.input === 'string' ? body.input.trim() : '';
  if (!input) return fail(400, 'Input requerido', event);
  if (input.length > MAX_INPUT_CHARS) return fail(400, `El input supera ${MAX_INPUT_CHARS} caracteres`, event);

  // Prueba sin costo: solo después de autenticar y autorizar.
  if (body.dryRun === true) return json(200, { authorized: true }, event);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fail(503, 'Generador no configurado', event);

  try {
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: CONTENT_PROMPT(input) }]
      })
    }, ANTHROPIC_TIMEOUT_MS);

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('generate-content: Anthropic respondió', res.status, detail.slice(0, 300));
      return fail(res.status === 429 ? 429 : 502, 'El generador no está disponible. Intenta de nuevo.', event);
    }
    // Contrato preservado: el panel lee data.content[].text y data.error.message.
    const data = await res.json();
    console.log('generate-content: ok', JSON.stringify({ uid: g.auth.uid, usage: data.usage || null }));
    return json(200, data, event);
  } catch (err) {
    const timeout = err && err.name === 'AbortError';
    console.error('generate-content: fallo', timeout ? 'timeout' : (err && err.name));
    return fail(timeout ? 504 : 500, timeout ? 'El generador tardó demasiado. Intenta de nuevo.' : 'Error interno del generador', event);
  }
};
