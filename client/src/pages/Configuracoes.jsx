import { useEffect, useState } from 'react';
import { Save, KeyRound, AlertTriangle, SlidersHorizontal, Layers, ListTree, Search, Eye, EyeOff } from 'lucide-react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../components/AuthContext.jsx';
import { CATEGORIAS_PROCEDIMENTO, formatarNumero } from '../components/labels.js';

export default function Configuracoes({ onEspecialidadesAlteradas }) {
  const { usuario } = useAuth();
  const admin = usuario?.papel === 'admin';
  const [especialidades, setEspecialidades] = useState([]);

  function carregarEspecialidades() {
    api.especialidades.listar().then(setEspecialidades).catch(() => {});
  }
  useEffect(carregarEspecialidades, []);

  return (
    <div>
      <h2>Configurações</h2>
      <div className="two-col">
        <RegrasIndicadores especialidades={especialidades} admin={admin} />
        <div>
          {admin && <Especialidades lista={especialidades} onAlterado={() => { carregarEspecialidades(); onEspecialidadesAlteradas?.(); }} />}
          <MinhaConta />
        </div>
      </div>
      {admin && <Procedimentos especialidades={especialidades} />}
    </div>
  );
}

function RegrasIndicadores({ especialidades, admin }) {
  const toast = useToast();
  const [escopo, setEscopo] = useState('global');
  const [dados, setDados] = useState(null);
  const [form, setForm] = useState({});
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  function aplicar(cfg) {
    setDados(cfg);
    // In a specialty scope, inherited values show as placeholders (empty = inherit).
    setForm(Object.fromEntries(Object.keys(cfg.definicoes).map((k) => [
      k, cfg.escopo === 'global' || cfg.origem[k] === cfg.escopo ? String(cfg.valores[k]) : '',
    ])));
  }
  useEffect(() => {
    setErro(null);
    api.configuracoes.obter(escopo).then(aplicar).catch((e) => toast.error(e.message));
  }, [escopo]);

  async function salvar(e) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const corpo = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]));
      aplicar(await api.configuracoes.atualizar(escopo, corpo));
      toast.success('Regras salvas. Os indicadores já usam os novos limites.');
    } catch (e) {
      setErro(e.detalhes?.length ? e.detalhes : [e.message]);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title"><SlidersHorizontal size={16} /> Regras dos indicadores</div>
      <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>Os limites gerais valem para todas as especialidades; cada especialidade pode ter os seus.</p>
      <div className="form-row">
        <label htmlFor="cfg-escopo">Aplicar a</label>
        <select id="cfg-escopo" value={escopo} onChange={(e) => setEscopo(e.target.value)}>
          <option value="global">Todas as especialidades (padrão geral)</option>
          {especialidades.map((e) => <option key={e.slug} value={e.slug}>{e.nome}</option>)}
        </select>
      </div>
      {!dados ? <p className="muted">Carregando…</p> : (
        <form onSubmit={salvar}>
          {Object.entries(dados.definicoes).map(([chave, def]) => (
            <div className="form-row" key={chave}>
              <label htmlFor={`cfg-${chave}`}>{def.rotulo} <span className="muted">({def.min}–{def.max})</span></label>
              <input
                id={`cfg-${chave}`}
                type="number"
                min={def.min}
                max={def.max}
                disabled={!admin}
                placeholder={escopo !== 'global' ? `${dados.valores[chave]} (herdado do geral)` : undefined}
                value={form[chave] ?? ''}
                onChange={(e) => setForm({ ...form, [chave]: e.target.value })}
              />
              <span className="hint">{def.descricao}</span>
            </div>
          ))}
          {erro && (
            <div className="error-text" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              {erro.map((d) => <span key={d}><AlertTriangle size={12} /> {d}</span>)}
            </div>
          )}
          {admin
            ? <button type="submit" disabled={salvando}><Save size={14} /> {salvando ? 'Salvando…' : 'Salvar'}</button>
            : <p className="muted" style={{ fontSize: 12 }}>Somente administradores alteram as regras.</p>}
        </form>
      )}
    </div>
  );
}

function Especialidades({ lista, onAlterado }) {
  const toast = useToast();
  async function alternar(e) {
    try {
      await api.especialidades.atualizar(e.id, { visivel: !e.visivel });
      toast.success(`${e.nome} ${e.visivel ? 'oculta' : 'liberada'} na interface.`);
      onAlterado();
    } catch (err) {
      toast.error(err.message);
    }
  }
  return (
    <div className="card">
      <div className="card-title"><Layers size={16} /> Especialidades na interface</div>
      <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>Todas são importadas e guardadas; só as liberadas aparecem no menu para a equipe.</p>
      <table>
        <thead><tr><th>Especialidade</th><th className="num">Pacientes</th><th className="num">Solicitações</th><th></th></tr></thead>
        <tbody>
          {lista.map((e) => (
            <tr key={e.id}>
              <td>{e.nome}</td>
              <td className="num">{formatarNumero(e.pacientes)}</td>
              <td className="num">{formatarNumero(e.solicitacoes)}</td>
              <td className="col-actions">
                <button className={e.visivel ? 'secondary' : 'ghost'} onClick={() => alternar(e)} title={e.visivel ? 'Ocultar do menu' : 'Liberar no menu'}>
                  {e.visivel ? <><Eye size={14} /> Liberada</> : <><EyeOff size={14} /> Oculta</>}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Procedimentos({ especialidades }) {
  const toast = useToast();
  const [lista, setLista] = useState([]);
  const [filtro, setFiltro] = useState({ especialidade_id: '', busca: '' });

  function carregar() {
    api.procedimentos.listar(filtro).then(setLista).catch((e) => toast.error(e.message));
  }
  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [filtro]);

  async function alterar(p, mudancas) {
    try {
      const r = await api.procedimentos.atualizar(p.codigo_interno, { especialidade_id: p.especialidade_id, categoria: p.categoria, ...mudancas });
      toast.success(`${p.codigo_interno} reclassificado (${r.solicitacoes_recalculadas} solicitações recalculadas).`);
      carregar();
    } catch (e) {
      toast.error(e.message);
    }
  }

  const semEspecialidade = lista.filter((p) => !p.especialidade_id).length;

  return (
    <div className="card">
      <div className="card-title"><ListTree size={16} /> Procedimentos do SISREG</div>
      <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
        Cada código interno define a especialidade da solicitação e se ela é consulta/retorno (conta falta) ou procedimento (produção).
        Códigos novos são classificados automaticamente na importação; corrija aqui se precisar.
      </p>
      <div className="filter-bar">
        <div className="search-box">
          <Search size={14} />
          <input placeholder="Código ou descrição…" value={filtro.busca} onChange={(e) => setFiltro((f) => ({ ...f, busca: e.target.value }))} aria-label="Buscar procedimento" />
        </div>
        <div className="filter-field">
          <select value={filtro.especialidade_id} onChange={(e) => setFiltro((f) => ({ ...f, especialidade_id: e.target.value }))} aria-label="Especialidade">
            <option value="">Todas as especialidades</option>
            <option value="sem">Sem especialidade{semEspecialidade ? ` (${semEspecialidade})` : ''}</option>
            {especialidades.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Código</th><th>Descrição</th><th className="num">Usos</th><th>Especialidade</th><th>Tipo</th></tr></thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.codigo_interno}>
                <td>{p.codigo_interno}<div className="cell-sub">SIGTAP {p.codigo_unificado ?? '—'}</div></td>
                <td style={{ fontSize: 12 }}>{p.descricao}{p.classificado_manualmente ? <span className="tag" style={{ marginLeft: 6 }}>manual</span> : null}</td>
                <td className="num">{formatarNumero(p.usos)}</td>
                <td>
                  <select className="status-select" value={p.especialidade_id ?? ''} onChange={(e) => alterar(p, { especialidade_id: e.target.value || null })} aria-label={`Especialidade de ${p.codigo_interno}`}>
                    <option value="">— sem especialidade —</option>
                    {especialidades.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                  </select>
                </td>
                <td>
                  <select className="status-select" value={p.categoria} onChange={(e) => alterar(p, { categoria: e.target.value })} aria-label={`Tipo de ${p.codigo_interno}`}>
                    {CATEGORIAS_PROCEDIMENTO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MinhaConta() {
  const toast = useToast();
  const { usuario } = useAuth();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [senhaConfirma, setSenhaConfirma] = useState('');
  const [erroSenha, setErroSenha] = useState(null);
  const [trocandoSenha, setTrocandoSenha] = useState(false);

  async function salvarSenha(e) {
    e.preventDefault();
    setErroSenha(null);
    if (senhaNova !== senhaConfirma) {
      setErroSenha('A confirmação não é igual à nova senha.');
      return;
    }
    setTrocandoSenha(true);
    try {
      await api.auth.trocarSenha(senhaAtual, senhaNova);
      toast.success('Senha alterada com sucesso.');
      setSenhaAtual('');
      setSenhaNova('');
      setSenhaConfirma('');
    } catch (e) {
      setErroSenha(e.message);
    } finally {
      setTrocandoSenha(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title"><KeyRound size={16} /> Minha conta</div>
      <p className="muted" style={{ marginTop: 0 }}>Logado como <strong>{usuario?.usuario}</strong></p>
      <form onSubmit={salvarSenha}>
        <div className="form-row">
          <label>Senha atual</label>
          <input type="password" autoComplete="current-password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} required />
        </div>
        <div className="form-row">
          <label>Nova senha</label>
          <input type="password" autoComplete="new-password" minLength={6} value={senhaNova} onChange={(e) => setSenhaNova(e.target.value)} required />
        </div>
        <div className="form-row">
          <label>Confirmar nova senha</label>
          <input type="password" autoComplete="new-password" minLength={6} value={senhaConfirma} onChange={(e) => setSenhaConfirma(e.target.value)} required />
        </div>
        {erroSenha && <p className="error-text">{erroSenha}</p>}
        <button type="submit" disabled={trocandoSenha}><KeyRound size={14} /> {trocandoSenha ? 'Salvando…' : 'Alterar senha'}</button>
      </form>
    </div>
  );
}
