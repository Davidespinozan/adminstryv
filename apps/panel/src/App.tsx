import { useEffect, useState, type FormEvent } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import Layout from './Layout';
import Grupo from './pantallas/Grupo';
import NegocioResumen from './pantallas/NegocioResumen';
import Tabla from './pantallas/Tabla';
import { NEGOCIOS } from './negocios';

/* ══════════════════════════════════════════════════════════════════════════
   La sesión dice QUIÉN sos. El permiso real —si podés ver los negocios— lo
   decide el BACKEND contra is_admin(), nunca el navegador: cualquier control
   que viva solo acá se salta con las herramientas de desarrollador.
   ══════════════════════════════════════════════════════════════════════════ */

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

  return (
    <BrowserRouter basename="/nuevo">
      <Routes>
        <Route element={<Layout email={sesion.user.email ?? ''} />}>
          <Route index element={<Grupo />} />
          {NEGOCIOS.map((n) => (
            <Route key={n.id} path={n.id}>
              <Route index element={<NegocioResumen />} />
              {n.pantallas.filter((p) => p.ruta).map((p) => (
                <Route key={p.ruta} path={p.ruta} element={<Tabla />} />
              ))}
            </Route>
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
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
    // Mensaje genérico a propósito: distinguir "el correo no existe" de
    // "contraseña incorrecta" le confirma a un atacante qué cuentas son válidas.
    if (error) setError('No pudimos entrar. Revisá el correo y la contraseña.');
    setEnviando(false);
  }

  return (
    <form onSubmit={entrar} style={est.login}>
      <p className="st-label">STRYV</p>
      <h1 style={{ fontFamily: 'var(--st-font-display)', fontSize: 22, margin: '0 0 10px' }}>Panel del grupo</h1>
      <input style={est.input} type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      <input style={est.input} type="password" placeholder="Contraseña" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" required />
      <button style={est.boton} disabled={enviando} type="submit">{enviando ? 'Entrando…' : 'Entrar'}</button>
      {error && <p style={{ color: 'var(--st-danger)', fontSize: 13, margin: 0 }}>{error}</p>}
    </form>
  );
}

const est: Record<string, React.CSSProperties> = {
  login: { maxWidth: 330, margin: '16vh auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '0 24px' },
  input: { padding: '11px 13px', borderRadius: 10, border: '1px solid var(--st-line)', fontSize: 14, fontFamily: 'inherit' },
  boton: { padding: '11px 13px', borderRadius: 10, border: 'none', background: 'var(--st-brand)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }
};
