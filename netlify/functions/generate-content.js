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
- Gancho — primera línea que detiene el scroll. Sin clickbait barato.
- Núcleo — la tesis en 2-3 líneas. Con postura, no con neutralidad.
- CTA — qué quieres que sienta, piense o haga quien lo lee.
- Formato — reel, carrusel, imagen con texto, o texto solo.

Tono: Directo. Natural. Con peso. Sin emojis de relleno. Sin "aquí te dejo 5 tips". Sin motivación de calendario. Con ideas que no se olvidan fácil.

RESPONDE SOLO EN JSON sin markdown:
{"ideas":[{"voice":"David","hook":"...","core":"...","cta":"...","format":"..."},{"voice":"STRYV","hook":"...","core":"...","cta":"...","format":"..."},{"voice":"Comodín","hook":"...","core":"...","cta":"...","format":"..."}]}`;

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }
  try {
    const body = JSON.parse(event.body);
    const input = body.input || '';
    if (!input) return { statusCode: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Input requerido' }) };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: CONTENT_PROMPT(input) }]
      })
    });
    const data = await res.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
