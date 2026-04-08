const STRYV_CONTEXT = `Eres David Espinoza, fundador de STRYV (stryvstudio.com) — un estudio que construye sistemas operativos digitales para negocios en México y Latinoamérica. Escribes desde Madrid, España.

STRYV ofrece 5 sistemas según lo que el negocio necesite:
1. Sistema de Ventas y Entrega — para negocios que venden online o quieren sistematizar su proceso comercial
2. Sistema de Atención y Soporte — para negocios con muchos mensajes, consultas o casos sin sistema
3. Sistema de Conversión y Retención Local — para negocios físicos que quieren más recurrencia de clientes
4. Sistema de Operación Interna — para negocios con inventario, producción, equipos o procesos internos complejos
5. Sistema de Contenido con IA — para negocios que necesitan generar contenido de forma sistemática

STRYV NO hace: branding, logos, contenido, redes sociales, ni publicidad pagada. Solo construye sistemas operativos digitales.
Los proyectos son por ticket de implementación (no mensualidades). Duran 4 a 6 semanas. Los primeros resultados se ven en 48-72 horas.`;

const EMAIL_RULES = `INSTRUCCIONES:
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

function buildManualPrompt(d) {
  const firstName = (d.name || '').split(' ')[0];
  return `${STRYV_CONTEXT}

PROSPECTO:
- Nombre: ${d.name}
- Negocio: ${d.business}
- Ciudad: ${d.city || 'no especificada'}
- URL/Instagram: ${d.url || 'no proporcionada'}
- Cómo te enteraste de ellos: ${d.source || 'búsqueda propia'}
- Qué hace el negocio: ${d.activity || 'no especificado'}
- Cómo vende: ${(d.howSells || []).join(', ') || 'no especificado'}
- Qué entrega: ${(d.whatDelivers || []).join(', ') || 'no especificado'}
- Operación actual: ${(d.operation || []).join(', ') || 'no especificado'}
- Problema principal: ${d.pain || 'no especificado'}
- Notas adicionales: ${d.notes || 'ninguna'}

${d.url ? 'Si hay sitio web o Instagram del prospecto, menciona algo específico que hayas "notado" en su presencia digital como gancho de apertura — algo concreto, no genérico.' : ''}
Si "cómo te enteraste" dice que es amigo, vecino, conocido, etc. — úsalo con naturalidad — NO lo cites textualmente ni lo pongas como dato raro.

${EMAIL_RULES}`;
}

function buildAgentPrompt(d) {
  return `${STRYV_CONTEXT}

PROSPECTO (datos de Google Places — analiza e infiere):
- Nombre del negocio: ${d.business}
- Ciudad: ${d.city || 'no especificada'}
- URL: ${d.url || 'no proporcionada'}
- Categoría Google: ${d.googleCategory || 'no especificada'}
- Descripción Google: ${d.googleDescription || 'no proporcionada'}
- Rating: ${d.googleRating || 'N/A'} (${d.googleReviews || 0} reseñas)
- Contacto: ${d.name || 'dueño/a'}

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

${EMAIL_RULES}`;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }
  try {
    const body = JSON.parse(event.body);

    // Determine prompt based on mode
    let prompt;
    if (body.mode === 'agent') {
      prompt = buildAgentPrompt(body.data || {});
    } else if (body.mode === 'manual') {
      prompt = buildManualPrompt(body.data || {});
    } else {
      // Legacy: raw prompt passed directly
      prompt = body.prompt;
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
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
