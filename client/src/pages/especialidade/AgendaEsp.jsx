import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X, CalendarClock, ArrowUpDown } from 'lucide-react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import Pagination from '../../components/Pagination.jsx';
import SkeletonRows from '../../components/SkeletonRows.jsx';
import StatusTag from '../../components/StatusTag.jsx';
import PatientDrawer from '../../components/PatientDrawer.jsx';
import { STATUS_SOLICITACAO, TIPOS_SOLICITACAO, formatarDataHora, nomeProprio, nomeCurto, listarTelefones } from '../../components/labels.js';

const CHAVES = ['busca', 'data_de', 'data_ate', 'profissional_id', 'status', 'tipo', 'ordem'];

/** Every SISREG solicitação of the specialty, newest first, with its derived status. */
export default function AgendaEsp({ slug, opcoes }) {
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const filtros = useMemo(() => Object.fromEntries(CHAVES.map((k) => [k, sp.get(k) ?? ''])), [sp]);
  const [buscaDigitada, setBuscaDigitada] = useState(filtros.busca);
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [resposta, setResposta] = useState({ items: [], total: 0, page: 1, pageSize: 50, totalPages: 1 });
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(null);

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

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    api.especialidades.agenda(slug, { ...filtros, page: pagina, page_size: pageSize })
      .then((r) => ativo && setResposta(r))
      .catch((e) => toast.error(e.message))
      .finally(() => ativo && setCarregando(false));
    return () => { ativo = false; };
  }, [slug, filtros, pagina, pageSize]);

  const ativos = CHAVES.filter((k) => k !== 'ordem' && filtros[k]).length;

  return (
    <div>
      <div className="card">
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <div className="search-box">
            <Search size={14} />
            <input placeholder="Paciente, CNS ou nº da solicitação…" value={buscaDigitada} onChange={(e) => setBuscaDigitada(e.target.value)} aria-label="Buscar" />
          </div>
          <div className="filter-field">
            <label>De</label>
            <input type="date" value={filtros.data_de} onChange={(e) => definir({ data_de: e.target.value })} />
          </div>
          <div className="filter-field">
            <label>Até</label>
            <input type="date" value={filtros.data_ate} onChange={(e) => definir({ data_ate: e.target.value })} />
          </div>
          <div className="filter-field">
            <label>Profissional</label>
            <select value={filtros.profissional_id} onChange={(e) => definir({ profissional_id: e.target.value })}>
              <option value="">Todos</option>
              {opcoes.profissionais.map((p) => <option key={p.id} value={p.id}>{nomeProprio(p.nome)}</option>)}
            </select>
          </div>
          <div className="filter-field">
            <label>Situação</label>
            <select value={filtros.status} onChange={(e) => definir({ status: e.target.value })}>
              <option value="">Todas</option>
              {STATUS_SOLICITACAO.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="filter-field">
            <label>Tipo</label>
            <select value={filtros.tipo} onChange={(e) => definir({ tipo: e.target.value })}>
              <option value="">Todos</option>
              {TIPOS_SOLICITACAO.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          {ativos > 0 && <button className="ghost" onClick={() => { setBuscaDigitada(''); setSp(new URLSearchParams(), { replace: true }); }}><X size={14} /> Limpar</button>}
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title">Solicitações ({resposta.total.toLocaleString('pt-BR')})</div>
          <button className="ghost" onClick={() => definir({ ordem: filtros.ordem === 'asc' ? '' : 'asc' })}>
            <ArrowUpDown size={14} /> {filtros.ordem === 'asc' ? 'Mais antigas primeiro' : 'Mais recentes primeiro'}
          </button>
        </div>
        <div className="table-wrap">
          <table className="clickable">
            <thead>
              <tr><th>Data / hora</th><th>Paciente</th><th>Profissional</th><th>Procedimentos</th><th>Situação</th></tr>
            </thead>
            <tbody>
              {carregando && resposta.items.length === 0 ? <SkeletonRows columns={5} rows={10} /> : resposta.items.length === 0 ? (
                <tr><td colSpan={5}><div className="empty-state"><CalendarClock size={28} />Nenhuma solicitação com os filtros atuais.</div></td></tr>
              ) : resposta.items.map((s) => (
                <tr key={s.id} onClick={() => setAberto(s.paciente_id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setAberto(s.paciente_id)} className={s.status === 'falta' ? 'row-faltou' : ''} style={{ opacity: carregando ? 0.6 : 1 }}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatarDataHora(s.data_hora)}<div className="cell-sub">nº {s.id}</div></td>
                  <td>
                    <div className="cell-main">{nomeProprio(s.paciente_nome)}</div>
                    <div className="cell-sub">{listarTelefones(s.telefones)[0] ?? `CNS ${s.cns}`}</div>
                  </td>
                  <td>{nomeCurto(s.profissional_nome)}</td>
                  <td style={{ maxWidth: 360 }}><span className="muted" style={{ fontSize: 12 }}>{s.procedimentos}</span></td>
                  <td><StatusTag status={s.status} /></td>
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

      {aberto && <PatientDrawer slug={slug} pacienteId={aberto} onFechar={() => setAberto(null)} />}
    </div>
  );
}
