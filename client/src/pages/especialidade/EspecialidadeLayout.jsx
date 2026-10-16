import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { LayoutDashboard, Users, CalendarClock, BookOpen } from 'lucide-react';
import { api } from '../../api.js';
import DefinicoesPanel from '../../components/DefinicoesPanel.jsx';
import { formatarData } from '../../components/labels.js';
import Painel from './Painel.jsx';
import PacientesEsp from './PacientesEsp.jsx';
import AgendaEsp from './AgendaEsp.jsx';

/**
 * Shell of one specialty: header + tabs. Loads the specialty's options
 * (professionals, municipalities, reference date) once for all tabs.
 */
export default function EspecialidadeLayout() {
  const { slug } = useParams();
  const [opcoes, setOpcoes] = useState(null);
  const [erro, setErro] = useState(null);
  const [definicoes, setDefinicoes] = useState(false);

  useEffect(() => {
    setOpcoes(null);
    setErro(null);
    api.especialidades.opcoes(slug).then(setOpcoes).catch((e) => setErro(e.message));
  }, [slug]);

  if (erro) return <div className="card"><p className="error-text">{erro}</p></div>;

  const abas = [
    { to: '', label: 'Painel', icon: LayoutDashboard, end: true },
    { to: 'pacientes', label: 'Pacientes', icon: Users },
    { to: 'agenda', label: 'Agenda', icon: CalendarClock },
  ];

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2 style={{ margin: 0 }}>{opcoes?.especialidade.nome ?? '…'}</h2>
          {opcoes && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Dados do SISREG até {formatarData(opcoes.referencia)}</div>}
        </div>
        <button className="secondary" onClick={() => setDefinicoes(true)}><BookOpen size={14} /> Como calculamos</button>
      </div>

      <nav className="tabs" aria-label="Seções da especialidade">
        {abas.map((a) => (
          <NavLink key={a.label} to={a.to} end={a.end} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            <a.icon size={14} /> {a.label}
          </NavLink>
        ))}
      </nav>

      {opcoes && (
        <Routes>
          <Route index element={<Painel slug={slug} opcoes={opcoes} />} />
          <Route path="pacientes" element={<PacientesEsp slug={slug} opcoes={opcoes} />} />
          <Route path="agenda" element={<AgendaEsp slug={slug} opcoes={opcoes} />} />
          <Route path="*" element={<Navigate to="" replace />} />
        </Routes>
      )}
      {definicoes && <DefinicoesPanel slug={slug} onFechar={() => setDefinicoes(false)} />}
    </div>
  );
}
