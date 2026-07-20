import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { Dashboard } from './screens/Dashboard';
import { Clientes } from './screens/Clientes';
import { Finanzas } from './screens/Finanzas';

// ============================================================================
// Puerta de entrada del panel.
// ----------------------------------------------------------------------------
// La sesión solo dice QUIÉN sos. El permiso real (si podés ver los negocios) lo
// decide el BACKEND contra `PANEL_ADMINS` — nunca el navegador. Cualquier
// control que viva solo acá se salta con las herramientas de desarrollador.
//
// Es lo contrario del panel viejo, donde un `const isA = true` convertía en
// administrador total a cualquiera que iniciara sesión.
// ============================================================================

export default function App() {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      setListo(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!listo) return null;
  if (!sesion) return <Login />;

  return <Panel email={sesion.user.email ?? ''} />;
}

/** Las secciones del hub. Se van sumando a medida que se migran del panel
 *  viejo; el consolidado es la única que no existía antes. */
const SECCIONES = [
  { id: 'consolidado', nombre: 'Consolidado' },
  { id: 'clientes', nombre: 'Clientes' },
  { id: 'finanzas', nombre: 'Finanzas' }
] as const;
type SeccionId = (typeof SECCIONES)[number]['id'];

function Panel({ email }: { email: string }) {
  const [seccion, setSeccion] = useState<SeccionId>('consolidado');

  return (
    <>
      <nav style={est.barra}>
        <div style={{ display: 'flex', gap: 4 }}>
          {SECCIONES.map((s) => (
            <button
              key={s.id}
              onClick={() => setSeccion(s.id)}
              style={{ ...est.tab, ...(seccion === s.id ? est.tabActiva : null) }}
            >
              {s.nombre}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span>{email}</span>
          <button style={est.link} onClick={() => void supabase.auth.signOut()}>
            Cerrar sesión
          </button>
        </div>
      </nav>

      {seccion === 'consolidado' && <Dashboard />}
      {seccion === 'clientes' && <Clientes />}
      {seccion === 'finanzas' && <Finanzas />}
    </>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    // Mensaje genérico a propósito: distinguir "email no existe" de "contraseña
    // incorrecta" le confirma a un atacante qué cuentas son válidas.
    if (error) setError('No pudimos entrar. Revisá el correo y la contraseña.');
    setEnviando(false);
  }

  return (
    <form onSubmit={entrar} style={est.login}>
      <p style={est.eyebrow}>STRYV</p>
      <h1 style={est.h1}>Panel de control</h1>
      <input
        style={est.input}
        type="email"
        placeholder="Correo"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />
      <input
        style={est.input}
        type="password"
        placeholder="Contraseña"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        autoComplete="current-password"
        required
      />
      <button style={est.boton} disabled={enviando} type="submit">
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
      {error && <p style={est.error}>{error}</p>}
    </form>
  );
}

const est: Record<string, React.CSSProperties> = {
  barra: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '10px 24px',
    borderBottom: '1px solid #e5e7eb',
    fontSize: 12.5,
    color: '#6b7280',
    fontFamily: 'system-ui, sans-serif'
  },
  link: { background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 12.5 },
  tab: { background: 'none', border: 'none', padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 13, color: '#6b7280', fontWeight: 600 },
  tabActiva: { background: '#111827', color: '#fff' },
  login: {
    maxWidth: 320,
    margin: '18vh auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    fontFamily: 'system-ui, sans-serif',
    padding: '0 24px'
  },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#6b7280', margin: 0 },
  h1: { fontSize: 22, fontWeight: 700, margin: '0 0 8px' },
  input: { padding: '11px 13px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 },
  boton: {
    padding: '11px 13px',
    borderRadius: 8,
    border: 'none',
    background: '#111827',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 14
  },
  error: { color: '#b91c1c', fontSize: 13, margin: 0 }
};