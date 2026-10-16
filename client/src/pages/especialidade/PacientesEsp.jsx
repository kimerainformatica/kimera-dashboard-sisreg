import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ListFilter, X, Download, Users, ArrowUp, ArrowDown, MessageSquareText } from 'lucide-react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import AlertBadge from '../../components/AlertBadge.jsx';
import Pagination from '../../components/Pagination.jsx';
import SkeletonRows from '../../components/SkeletonRows.jsx';
import PatientDrawer from '../../components/PatientDrawer.jsx';
import {
  NIVEIS_ALERTA, STATUS_ACOMPANHAMENTO, formatarData, formatarPct, nomeProprio, nomeCurto, labelAcompanhamento, listarTelefones,
} from '../../components/labels.js';

const ORDENACOES = [
  { value: 'alerta', label: 'Gravidade do alerta' },
  { value: 'faltas', label: 'Nº de faltas' },
  { value: 'faltas_consecutivas', label: 'Faltas seguidas' },
  { value: 'dias_sem_retorno', label: 'Dias sem retorno' },
  { value: 'comparecimento', label: 'Menor comparecimento' },
  { value: 'ultima_visita', label: 'Última visita' },
  { value: 'primeira_visita', label: 'Primeira visita' },
  { value: 'nome', label: 'Nome' },
  { value: 'idade', label: 'Idade' },
];

// Filters live in the URL so the overview tiles can deep-link here.
const CHAVES_FILTRO = ['busca', 'nivel', 'profissional_id', 'acompanhamento', 'faltas_min', 'dias_sem_retorno_min', 'idade_min', 'idade_max', 'sexo', 'municipio', 'aparelho', 'sem_agendamento', 'primeira_visita_de', 'primeira_visita_ate'];

export default function PacientesEsp({ slug, opcoes }) {
  const toast = useToast();
  const ehOrto = slug === 'ortodontia';
  const [sp, setSp] = useSearchParams();
  const filtros = useMemo(() => Object.fromEntries(CHAVES_FILTRO.map((k) => [k, sp.get(k) ?? ''])), [sp]);
  const ordenarPor = sp.get('ordenar_por') || 'alerta';
  const direcao = sp.get('direcao') || '';

  const [buscaDigitada, setBuscaDigitada] = useState(filtros.busca);
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [resposta, setResposta] = useState({ items: [], total: 0, page: 1, pageSize: 50, totalPages: 1 });
  const [carregando, setCarregando] = useState(true);
  const [filtrosAbertos, setFiltrosAbertos] = useState(() => CHAVES_FILTRO.some((k) => k !== 'busca' && k !== 'nivel' && sp.get(k)));
  const [aberto, setAberto] = useState(null);
  const [versao, setVersao] = useState(0);

  const definir = useCallback((mudancas) => {
    setSp((atual) => {
      const novo = new URLSearchParams(atual);
      for (const [k, v] of Object.entries(mudancas)) {
        if (v === '' || v == null) novo.delete(k);
        else novo.set(k, v);
      }
      return novo;
    }, { replace: true });
    setPagina(1);
  }, [setSp]);

  useEffect(() => {
    const t = setTimeout(() => { if (buscaDigitada !== filtros.busca) definir({ busca: buscaDigitada }); }, 300);
    return () => clearTimeout(t);
  }, [buscaDigitada]);

  const consulta = useMemo(() => ({ ...filtros, ordenar_por: ordenarPor, direcao }), [filtros, ordenarPor, direcao]);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    api.especialidades.pacientes(slug, { ...consulta, page: pagina, page_size: pageSize })
      .then((r) => ativo && setResposta(r))
      .catch((e) => toast.error(e.message))
      .finally(() => ativo && setCarregando(false));
    return () => { ativo = false; };
  }, [slug, consulta, pagina, pageSize, versao]);

  const ativos = CHAVES_FILTRO.filter((k) => filtros[k]).length;
  const limpar = () => {
    setBuscaDigitada('');
    setSp(new URLSearchParams(), { replace: true });
    setPagina(1);
  };

  const colunas = [
    { chave: 'ranking', rotulo: '#' },
    { chave: 'nome', rotulo: 'Paciente', ordem: 'nome' },
    { chave: 'idade', rotulo: 'Idade', ordem: 'idade', num: true },
    { chave: 'prof', rotulo: 'Profissional' },
    { chave: 'ultima', rotulo: 'Última visita', ordem: 'ultima_visita' },
    { chave: 'comp', rotulo: 'Compar.', ordem: 'comparecimento', num: true },
    { chave: 'faltas', rotulo: 'Faltas', ordem: 'faltas', num: true },
    { chave: 'seg', rotulo: 'Seguidas', ordem: 'faltas_consecutivas', num: true },
    { chave: 'dsr', rotulo: 'Dias s/ retorno', ordem: 'dias_sem_retorno', num: true },
    ...(ehOrto ? [{ chave: 'aparelho', rotulo: 'Aparelho' }] : []),
    { chave: 'alerta', rotulo: 'Alerta', ordem: 'alerta' },
  ];

  function ordenarColuna(c) {
    if (!c.ordem) return;
    if (ordenarPor === c.ordem) definir({ direcao: direcao === 'asc' ? '' : 'asc' });
    else definir({ ordenar_por: c.ordem === 'alerta' ? '' : c.ordem, direcao: '' });
  }

  return (
    <div>
      <div className="card">
        <div className="filter-bar">
          <div className="search-box">
            <Search size={14} />
            <input placeholder="Buscar por nome, CNS ou telefone…" value={buscaDigitada} onChange={(e) => setBuscaDigitada(e.target.value)} aria-label="Buscar paciente" />
          </div>
          <div className="filter-field">
            <select value={filtros.nivel} onChange={(e) => definir({ nivel: e.target.value })} aria-label="Nível de alerta">
              <option value="">Todos os alertas</option>
              <option value="critico,sem_retorno,faltoso">Qualquer alerta</option>
              {NIVEIS_ALERTA.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
            </select>
          </div>
          <div className="filter-field">
            <select value={filtros.profissional_id} onChange={(e) => definir({ profissional_id: e.target.value })} aria-label="Profissional">
              <option value="">Todos os profissionais</option>
              {opcoes.profissionais.map((p) => <option key={p.id} value={p.id}>{nomeProprio(p.nome)}</option>)}
            </select>
          </div>
          <button className="secondary" onClick={() => setFiltrosAbertos((v) => !v)} aria-expanded={filtrosAbertos}>
            <ListFilter size={14} /> Mais filtros{ativos > 0 ? ` (${ativos})` : ''}
          </button>
          {ativos > 0 && <button className="ghost" onClick={limpar}><X size={14} /> Limpar</button>}
          <a className="button secondary" href={api.especialidades.urlExportacaoPacientes(slug, consulta)} download><Download size={14} /> Exportar CSV</a>
        </div>

        {filtrosAbertos && (
          <div className="filter-bar" style={{ borderTop: '1px solid var(--gridline)', paddingTop: 14, marginBottom: 0 }}>
            <div className="filter-field">
              <label>Acompanhamento</label>
              <select value={filtros.acompanhamento} onChange={(e) => definir({ acompanhamento: e.target.value })}>
                <option value="">Todos</option>
                <option value="sem">Não informado</option>
                {STATUS_ACOMPANHAMENTO.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="filter-field">
              <label>Mín. de faltas</label>
              <input type="number" min="0" style={{ width: 90 }} value={filtros.faltas_min} onChange={(e) => definir({ faltas_min: e.target.value })} />
            </div>
            <div className="filter-field">
              <label>Mín. dias sem retorno</label>
              <input type="number" min="0" style={{ width: 110 }} value={filtros.dias_sem_retorno_min} onChange={(e) => definir({ dias_sem_retorno_min: e.target.value })} />
            </div>
            <div className="filter-field">
              <label>Idade de</label>
              <input type="number" min="0" style={{ width: 80 }} value={filtros.idade_min} onChange={(e) => definir({ idade_min: e.target.value })} />
            </div>
            <div className="filter-field">
              <label>até</label>
              <input type="number" min="0" style={{ width: 80 }} value={filtros.idade_max} onChange={(e) => definir({ idade_max: e.target.value })} />
            </div>
            <div className="filter-field">
              <label>Sexo</label>
              <select value={filtros.sexo} onChange={(e) => definir({ sexo: e.target.value })}>
                <option value="">Todos</option>
                <option value="F">Feminino</option>
                <option value="M">Masculino</option>
              </select>
            </div>
            <div className="filter-field">
              <label>Município</label>
              <select value={filtros.municipio} onChange={(e) => definir({ municipio: e.target.value })}>
                <option value="">Todos</option>
                {opcoes.municipios.map((m) => <option key={m.nome} value={m.nome}>{m.nome} ({m.pacientes})</option>)}
              </select>
            </div>
            {ehOrto && (
              <div className="filter-field">
                <label>Aparelho</label>
                <select value={filtros.aparelho} onChange={(e) => definir({ aparelho: e.target.value })}>
                  <option value="">Todos</option>
                  <option value="fixo">Instalou fixo</option>
                  <option value="removivel">Removível</option>
                  <option value="sem">Sem instalação nos dados</option>
                </select>
              </div>
            )}
            <div className="filter-field">
              <label>Primeira visita de</label>
              <input type="date" value={filtros.primeira_visita_de} onChange={(e) => definir({ primeira_visita_de: e.target.value })} />
            </div>
            <div className="filter-field">
              <label>até</label>
              <input type="date" value={filtros.primeira_visita_ate} onChange={(e) => definir({ primeira_visita_ate: e.target.value })} />
            </div>
            <div className="filter-field">
              <label>Ordenar por</label>
              <select value={ordenarPor} onChange={(e) => definir({ ordenar_por: e.target.value === 'alerta' ? '' : e.target.value, direcao: '' })}>
                {ORDENACOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Pacientes ({resposta.total.toLocaleString('pt-BR')})</div>
        <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
          Ordenado por {ORDENACOES.find((o) => o.value === ordenarPor)?.label.toLowerCase()}{direcao === 'asc' ? ' (invertido)' : ''}. Clique em uma linha para ver o histórico e registrar o acompanhamento.
        </p>
        <div className="table-wrap">
          <table className="clickable">
            <thead>
              <tr>
                {colunas.map((c) => (
                  <th
                    key={c.chave}
                    className={`${c.ordem ? 'sortable' : ''} ${c.num ? 'num' : ''}`}
                    onClick={() => ordenarColuna(c)}
                    aria-sort={ordenarPor === c.ordem ? (direcao === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {c.rotulo}
                    {ordenarPor === c.ordem && (direcao === 'asc' ? <ArrowUp size={11} className="sort-icon" /> : <ArrowDown size={11} className="sort-icon" />)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {carregando && resposta.items.length === 0 ? (
                <SkeletonRows columns={colunas.length} rows={10} />
              ) : resposta.items.length === 0 ? (
                <tr><td colSpan={colunas.length}><div className="empty-state"><Users size={28} />Nenhum paciente encontrado com os filtros atuais.</div></td></tr>
              ) : resposta.items.map((p) => (
                <tr key={p.id} onClick={() => setAberto(p.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setAberto(p.id)} style={{ opacity: carregando ? 0.6 : 1 }}>
                  <td className="muted">{p.ranking}</td>
                  <td>
                    <div className="cell-main">
                      {nomeProprio(p.nome)}
                      {p.tem_observacoes && <MessageSquareText size={12} className="muted" style={{ marginLeft: 6, verticalAlign: -1 }} aria-label="Tem observações" />}
                    </div>
                    <div className="cell-sub">
                      {listarTelefones(p.telefones)[0] ?? `CNS ${p.cns}`}
                      {p.acompanhamento_status && ` · ${labelAcompanhamento(p.acompanhamento_status)}`}
                    </div>
                  </td>
                  <td className="num">{p.idade ?? '—'}</td>
                  <td>{p.profissional_nome ? nomeCurto(p.profissional_nome) : '—'}</td>
                  <td>{p.ultimaVisita ? formatarData(p.ultimaVisita) : <span className="muted">nunca</span>}</td>
                  <td className="num">{formatarPct(p.taxaComparecimento)}</td>
                  <td className="num">{p.faltas}</td>
                  <td className="num">{p.faltasConsecutivas}</td>
                  <td className="num">{p.diasSemRetorno ?? '—'}</td>
                  {ehOrto && <td>{p.instalacao ? <span className="tag">{p.instalacao.tipo === 'fixo' ? 'Fixo' : 'Removível'} · {formatarData(p.instalacao.data).slice(0, 5)}</span> : <span className="muted">—</span>}</td>}
                  <td><AlertBadge nivel={p.nivel} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={resposta.page} pageSize={resposta.pageSize} total={resposta.total} totalPages={resposta.totalPages}
          onPageChange={setPagina}
          onPageSizeChange={(n) => { setPageSize(n); setPagina(1); }}
        />
      </div>

      {aberto && <PatientDrawer slug={slug} pacienteId={aberto} onFechar={() => setAberto(null)} onAlterado={() => setVersao((v) => v + 1)} />}
    </div>
  );
}
