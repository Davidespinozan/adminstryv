/* ══════════════════════════════════════════════════════════════════════════
   LOS CUATRO NEGOCIOS DEL GRUPO
   ──────────────────────────────────────────────────────────────────────────
   Un solo lugar define qué negocios hay, cómo se llaman, qué pantallas tiene
   cada uno y de qué base salen sus datos. La navegación, las rutas y el
   resumen se generan de acá: agregar un quinto negocio es agregar una entrada,
   no tocar seis archivos.

   Cada negocio tiene un MODELO DISTINTO, y por eso sus pantallas son
   distintas. Un food truck no se administra como un SaaS.
   ══════════════════════════════════════════════════════════════════════════ */

export interface Pantalla {
  ruta: string;
  nombre: string;
}

export interface Negocio {
  id: 'sala' | 'stryv' | 'hsc' | 'healthyspace';
  nombre: string;
  /** Dónde se OPERA de verdad este negocio. Cada uno tiene su propio sistema,
   *  probado y en uso; el panel del grupo mira y lleva ahí, no lo reemplaza. */
  opera?: { url: string; texto: string };
  /** Cómo gana dinero. Se muestra debajo del nombre: es lo primero que hay
   *  que recordar al mirar sus números. */
  modelo: string;
  logo: string;
  base: string;
  pantallas: Pantalla[];
}

export const NEGOCIOS: Negocio[] = [
  {
    id: 'sala',
    nombre: 'SALA Studio',
    modelo: 'SaaS · mensualidad por gym',
    logo: '/logos/sala.png',
    base: 'omrlbvhbggnrwwzlgxji',
    // SALA no tiene un panel único: cada gym opera en su propio subdominio.
    // Por eso el enlace vive en la ficha de cada gym, no acá.
    pantallas: [
      { ruta: '', nombre: 'Resumen' },
      { ruta: 'gyms', nombre: 'Gyms' },
      { ruta: 'cobros', nombre: 'Cobros' }
    ]
  },
  {
    id: 'stryv',
    nombre: 'Stryv',
    modelo: 'Implementación · proyecto + retainer',
    logo: '/logos/stryv.png',
    base: 'lxpgqhghxfqsahwrdmzo',
    opera: { url: '/', texto: 'Abrir el panel de Stryv' },
    pantallas: [
      { ruta: '', nombre: 'Resumen' },
      { ruta: 'clientes', nombre: 'Clientes' },
      { ruta: 'pipeline', nombre: 'Pipeline' },
      { ruta: 'prospeccion', nombre: 'Prospección' },
      { ruta: 'proyectos', nombre: 'Proyectos' },
      { ruta: 'cobros', nombre: 'Cobros' }
    ]
  },
  {
    id: 'hsc',
    nombre: 'Healthy Space Club',
    modelo: 'Suscripción · socios',
    logo: '/logos/hsc.png',
    base: 'ltveorvqvvlyivjwxjlc',
    opera: { url: 'https://healthyspaceclub.com', texto: 'Abrir la app del Club' },
    pantallas: [
      { ruta: '', nombre: 'Resumen' },
      { ruta: 'socios', nombre: 'Socios' },
      { ruta: 'adherencia', nombre: 'Adherencia' }
    ]
  },
  {
    id: 'healthyspace',
    nombre: 'Healthy Space',
    modelo: 'Food trucks · venta directa',
    logo: '/logos/healthyspace.webp',
    base: 'ltveorvqvvlyivjwxjlc',
    opera: { url: 'https://healthyspaceculiacan.netlify.app/staff', texto: 'Abrir la operación del truck' },
    pantallas: [
      { ruta: '', nombre: 'Resumen' },
      { ruta: 'menu', nombre: 'Menú y margen' },
      { ruta: 'remolques', nombre: 'Remolques' },
      { ruta: 'inventario', nombre: 'Inventario' }
    ]
  }
];

export const negocioPorId = (id: string): Negocio | undefined =>
  NEGOCIOS.find((n) => n.id === id);