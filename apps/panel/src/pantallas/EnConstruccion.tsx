import { useParams, useLocation } from 'react-router-dom';
import { negocioPorId } from '../negocios';

/* Una pantalla declarada pero todavía sin construir. Se dice con todas las
   letras en vez de mostrar una pantalla vacía que parezca rota o, peor, una
   con datos de mentira. */
export default function EnConstruccion() {
  const { id = '' } = useParams();
  const loc = useLocation();
  const n = negocioPorId(id);
  const pantalla = loc.pathname.split('/')[2] ?? '';
  const nombre = n?.pantallas.find((p) => p.ruta === pantalla)?.nombre ?? pantalla;

  return (
    <div className="st-card">
      <div className="st-label">{n?.nombre}</div>
      <h3 style={{ fontFamily: 'var(--st-font-display)', fontSize: 18, margin: '8px 0 10px' }}>{nombre}</h3>
      <p style={{ fontSize: 13, color: 'var(--st-ink-muted)', lineHeight: 1.6, margin: 0, maxWidth: 560 }}>
        Esta pantalla todavía no está construida. Está declarada acá para que se
        vea qué falta, en vez de que el panel simule estar completo.
      </p>
    </div>
  );
}
