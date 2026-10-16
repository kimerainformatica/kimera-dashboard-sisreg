import { useCallback, useEffect, useState } from 'react';
import { NavLink, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Upload, Settings, Menu, Smile, LogOut, UserCog, Stethoscope } from 'lucide-react';
import EspecialidadeLayout from './pages/especialidade/EspecialidadeLayout.jsx';
import Importacao from './pages/Importacao.jsx';
import Configuracoes from './pages/Configuracoes.jsx';
import Usuarios from './pages/Usuarios.jsx';
import Login from './pages/Login.jsx';
import { useAuth } from './components/AuthContext.jsx';
import { api } from './api.js';

const ICONE_ESPECIALIDADE = { ortodontia: Smile };

export default function App() {
  const { usuario, carregando, logout } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);
  const [especialidades, setEspecialidades] = useState(null);
  const location = useLocation();

  useEffect(() => setMenuAberto(false), [location.pathname]);

  const carregarEspecialidades = useCallback(() => {
    api.especialidades.listar().then(setEspecialidades).catch(() => setEspecialidades([]));
  }, []);
  useEffect(() => { if (usuario) carregarEspecialidades(); }, [usuario, carregarEspecialidades]);

  if (carregando) return <div style={{ minHeight: '100vh', background: 'var(--page)' }} />;
  if (!usuario) return <Login />;

  const visiveis = (especialidades ?? []).filter((e) => e.visivel);
  const admin = usuario.papel === 'admin';
  const links = [
    { to: '/importar', label: 'Importar SISREG', icon: Upload },
    ...(admin ? [{ to: '/usuarios', label: 'Usuários', icon: UserCog }] : []),
    { to: '/configuracoes', label: 'Configurações', icon: Settings },
  ];
  const paginaAtual = [...visiveis.map((e) => ({ to: `/e/${e.slug}`, label: e.nome })), ...links].find((l) => location.pathname.startsWith(l.to));

  return (
    <div className="app-shell">
      <div className={`sidebar-backdrop${menuAberto ? ' open' : ''}`} onClick={() => setMenuAberto(false)} />

      <aside className={`sidebar${menuAberto ? ' open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Smile size={18} /></div>
          <h1>
            KIMERA SYSTEM
            <small>Gestão Clínica · SISREG</small>
          </h1>
        </div>
        <nav>
          <div className="nav-grupo">Especialidades</div>
          {especialidades && visiveis.length === 0 && <div className="nav-vazio">Nenhuma liberada{admin ? ' — veja Configurações' : ''}</div>}
          {visiveis.map((e) => {
            const Icone = ICONE_ESPECIALIDADE[e.slug] ?? Stethoscope;
            return (
              <NavLink key={e.slug} to={`/e/${e.slug}`} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
                <Icone size={16} /> {e.nome}
              </NavLink>
            );
          })}
          <div className="nav-grupo">Sistema</div>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              <l.icon size={16} /> {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span title={usuario.usuario}>{usuario.nome || usuario.usuario}</span>
            <button className="ghost icon-btn" onClick={logout} aria-label="Sair" title="Sair">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="topbar">
          <button className="icon-btn ghost" onClick={() => setMenuAberto(true)} aria-label="Abrir menu">
            <Menu size={18} />
          </button>
          <strong>{paginaAtual?.label ?? 'KIMERA SYSTEM'}</strong>
        </div>

        <main className="main">
          {especialidades && (
            <Routes>
              <Route path="/e/:slug/*" element={<EspecialidadeLayout />} />
              <Route path="/importar" element={<Importacao />} />
              {admin && <Route path="/usuarios" element={<Usuarios />} />}
              <Route path="/configuracoes" element={<Configuracoes onEspecialidadesAlteradas={carregarEspecialidades} />} />
              <Route path="*" element={<Navigate to={visiveis[0] ? `/e/${visiveis[0].slug}` : '/importar'} replace />} />
            </Routes>
          )}
        </main>
      </div>
    </div>
  );
}
