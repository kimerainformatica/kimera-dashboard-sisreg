import { useState } from 'react';
import { Smile, LogIn, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../components/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState(null);
  const [entrando, setEntrando] = useState(false);

  async function aoEnviar(e) {
    e.preventDefault();
    setErro(null);
    setEntrando(true);
    try {
      await login(usuario, senha);
    } catch (e) {
      setErro(e.message);
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--page)', padding: 16,
    }}>
      <div className="card" style={{ width: 360, maxWidth: '100%', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 22 }}>
          <div className="brand-mark" style={{ width: 44, height: 44 }}><Smile size={22} /></div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>KIMERA SYSTEM</div>
            <div className="muted" style={{ fontSize: 12 }}>Gestão Clínica</div>
          </div>
        </div>

        <form onSubmit={aoEnviar}>
          <div className="form-row">
            <label>Usuário</label>
            <input
              autoFocus
              autoComplete="username"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="usuario.login"
            />
          </div>
          <div className="form-row">
            <label>Senha</label>
            <div style={{ position: 'relative' }}>
              <input
                type={mostrarSenha ? 'text' : 'password'}
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                style={{ width: '100%', paddingRight: 36 }}
              />
              <button
                type="button"
                className="ghost icon-btn"
                onClick={() => setMostrarSenha((v) => !v)}
                style={{ position: 'absolute', right: 2, top: 2, padding: 6 }}
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {mostrarSenha ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {erro && <p className="error-text"><AlertTriangle size={13} /> {erro}</p>}

          <button type="submit" disabled={entrando || !usuario || !senha} style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}>
            <LogIn size={14} /> {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
