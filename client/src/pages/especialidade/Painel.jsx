import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarCheck, UserCheck, UserX, Percent, UserPlus, Wrench, Anchor, Smile, AlertOctagon, Clock, AlertTriangle, CheckCircle2, Archive, Stethoscope, Activity,
} from 'lucide-react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import StatTile from '../../components/StatTile.jsx';
import ColunasMensais from '../../components/ColunasMensais.jsx';
import { formatarMes, limitesMes, formatarNumero, formatarPct, formatarData, nomeProprio } from '../../components/labels.js';

const TILES_ALERTA = [
  { nivel: 'critico', rotulo: 'Críticos', tone: 'critical', icon: AlertOctagon, hint: 'faltas seguidas' },
  { nivel: 'sem_retorno', rotulo: 'Sem retorno', tone: 'serious', icon: Clock, hint: 'sem agenda futura' },
  { nivel: 'faltoso', rotulo: 'Faltosos', tone: 'warning', icon: AlertTriangle, hint: 'ao menos 1 falta' },
  { nivel: 'em_dia', rotulo: 'Em dia', tone: 'good', icon: CheckCircle2 },
  { nivel: 'encerrado', rotulo: 'Encerrados', icon: Archive, hint: 'marcados pela equipe' },
];

export default function Painel({ slug, opcoes }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState({ mes: '', inicio: '', fim: '', profissional_id: '' });
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const params = useMemo(() => {
    const periodo = filtro.mes ? limitesMes(filtro.mes) : { inicio: filtro.inicio, fim: filtro.fim };
    return { ...periodo, profissional_id: filtro.profissional_id };
  }, [filtro]);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    api.especialidades.painel(slug, params)
      .then((d) => {
        if (!ativo) return;
        setDados(d);
        // Default view: the latest month with data.
        if (!filtro.mes && !filtro.inicio && !filtro.fim && d.mesesDisponiveis.length && !dados) {
          setFiltro((f) => ({ ...f, mes: d.mesesDisponiveis[d.mesesDisponiveis.length - 1] }));
        }
      })
      .catch((e) => toast.error(e.message))
      .finally(() => ativo && setCarregando(false));
    return () => { ativo = false; };
  }, [slug, params]);

  const k = dados?.kpis;
  const orto = dados?.ortodontia;
  const maxTaxa = Math.max(0.0001, ...(dados?.porProfissional ?? []).map((p) => p.taxaFaltas ?? 0));
  const irParaPacientes = (nivel) => navigate(`pacientes?nivel=${nivel}${filtro.profissional_id ? `&profissional_id=${filtro.profissional_id}` : ''}`);

  return (
    <div style={{ opacity: carregando && dados ? 0.6 : 1, transition: 'opacity 0.15s' }}>
      <div className="card filtros-painel">
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <div className="filter-field">
            <label>Mês</label>
            <div className="segmented" role="group" aria-label="Mês">
              {dados?.mesesDisponiveis.map((m) => (
                <button key={m} type="button" className={filtro.mes === m ? 'active' : ''} onClick={() => setFiltro((f) => ({ ...f, mes: m, inicio: '', fim: '' }))}>
                  {formatarMes(m)}
                </button>
              ))}
              <button type="button" className={!filtro.mes && !filtro.inicio && !filtro.fim ? 'active' : ''} onClick={() => setFiltro((f) => ({ ...f, mes: '', inicio: '', fim: '' }))}>
                Tudo
              </button>
            </div>
          </div>
          <div className="filter-field">
            <label htmlFor="p-ini">De</label>
            <input id="p-ini" type="date" value={filtro.mes ? limitesMes(filtro.mes).inicio : filtro.inicio} onChange={(e) => setFiltro((f) => ({ ...f, mes: '', inicio: e.target.value, fim: f.mes ? limitesMes(f.mes).fim : f.fim }))} />
          </div>
          <div className="filter-field">
            <label htmlFor="p-fim">Até</label>
            <input id="p-fim" type="date" value={filtro.mes ? limitesMes(filtro.mes).fim : filtro.fim} onChange={(e) => setFiltro((f) => ({ ...f, mes: '', fim: e.target.value, inicio: f.mes ? limitesMes(f.mes).inicio : f.inicio }))} />
          </div>
          <div className="filter-field">
            <label htmlFor="p-prof">Profissional</label>
            <select id="p-prof" value={filtro.profissional_id} onChange={(e) => setFiltro((f) => ({ ...f, profissional_id: e.target.value }))}>
              <option value="">Todos</option>
              {opcoes.profissionais.map((p) => <option key={p.id} value={p.id}>{nomeProprio(p.nome)}</option>)}
            </select>
          </div>
        </div>
      </div>

      {!dados ? <div className="card"><span className="skeleton skeleton-line" style={{ width: '40%' }} /></div> : (
        <>
          <div className="secao-titulo">
            Atendimento no período <span className="muted">{formatarData(dados.periodo.inicio)} a {formatarData(dados.periodo.fim)}</span>
          </div>
          <div className="stat-grid">
            <StatTile label="Consultas agendadas" value={formatarNumero(k.agendadas)} icon={CalendarCheck} hint={k.semAtualizacao ? `${k.semAtualizacao} sem atualização` : 'retornos e consultas'} />
            <StatTile label="Comparecimentos" value={formatarNumero(k.comparecimentos)} icon={UserCheck} />
            <StatTile label="Faltas" value={formatarNumero(k.faltas)} icon={UserX} onClick={() => navigate('agenda?status=falta' + (params.inicio ? `&data_de=${params.inicio}&data_ate=${params.fim}` : ''))} hint="ver na agenda" />
            <StatTile label="Taxa de faltas" value={formatarPct(k.taxaFaltas, 1)} icon={Percent} hint="faltas ÷ (faltas + comparecimentos)" />
            <StatTile label="Pacientes atendidos" value={formatarNumero(k.pacientesAtendidos)} icon={Activity} />
            <StatTile
              label="Primeira visita no período"
              value={formatarNumero(k.pacientesNovos)}
              icon={UserPlus}
              hint={k.novosConfiavel ? 'pacientes novos' : `inclui quem já tratava antes de ${formatarData(dados.dadosDesde)}`}
            />
          </div>

          {orto && (
            <div className="stat-grid compact">
              <StatTile label="Instalações de aparelho fixo" value={formatarNumero(orto.instalacoesFixo)} icon={Anchor} />
              <StatTile label="Aparelhos removíveis" value={formatarNumero(orto.aparelhosRemoviveis)} icon={Smile} />
              <StatTile label="Manutenções" value={formatarNumero(orto.manutencoes)} icon={Wrench} />
              <StatTile label="Moldagens ortodônticas" value={formatarNumero(orto.moldagens)} icon={Stethoscope} />
            </div>
          )}

          <div className="secao-titulo">
            Situação dos pacientes hoje <span className="muted">clique para ver a lista</span>
          </div>
          <div className="stat-grid compact">
            {TILES_ALERTA.map((t) => (
              <StatTile key={t.nivel} label={t.rotulo} value={formatarNumero(dados.alertas[t.nivel])} tone={dados.alertas[t.nivel] > 0 ? t.tone : undefined} icon={t.icon} hint={t.hint} onClick={() => irParaPacientes(t.nivel)} />
            ))}
          </div>

          <div className="card">
            <div className="card-title">Comparecimentos e faltas por mês</div>
            <p className="muted" style={{ marginTop: 2, fontSize: 12 }}>Consultas e retornos agendados. Os meses fora do período selecionado aparecem esmaecidos; clique em uma coluna para filtrar o mês.</p>
            <ColunasMensais dados={dados.serieMensal} periodo={dados.periodo} onSelecionarMes={(m) => setFiltro((f) => ({ ...f, mes: m, inicio: '', fim: '' }))} />
          </div>

          <div className="two-col">
            <div className="card">
              <div className="card-title">Por profissional</div>
              <p className="muted" style={{ marginTop: 2, fontSize: 12 }}>No período selecionado. A barra mostra a taxa de faltas.</p>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Profissional</th><th className="num">Agendadas</th><th className="num">Faltas</th><th>Taxa de faltas</th><th className="num">Pacientes</th></tr></thead>
                  <tbody>
                    {dados.porProfissional.length === 0 && <tr><td colSpan={5} className="muted">Sem atendimentos no período.</td></tr>}
                    {dados.porProfissional.map((p) => (
                      <tr key={p.profissional_id}>
                        <td>{nomeProprio(p.nome)}</td>
                        <td className="num">{formatarNumero(p.agendadas)}</td>
                        <td className="num">{formatarNumero(p.faltas)}</td>
                        <td>
                          <span className="barra-inline" title={`${p.faltas} de ${p.comparecimentos + p.faltas} consultas realizadas`}>
                            <i style={{ width: `${((p.taxaFaltas ?? 0) / maxTaxa) * 100}%` }} />
                            <b>{formatarPct(p.taxaFaltas, 1)}</b>
                          </span>
                        </td>
                        <td className="num">{formatarNumero(p.pacientesAtendidos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card">
              <div className="card-title">Procedimentos realizados</div>
              <p className="muted" style={{ marginTop: 2, fontSize: 12 }}>Itens confirmados no período ({formatarNumero(k.procedimentosRealizados)} no total).</p>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Procedimento</th><th className="num">Qtde.</th></tr></thead>
                  <tbody>
                    {dados.procedimentos.length === 0 && <tr><td colSpan={2} className="muted">Nenhum procedimento no período.</td></tr>}
                    {dados.procedimentos.map((p) => (
                      <tr key={p.codigo}>
                        <td><div className="cell-main" style={{ fontWeight: 400 }}>{p.descricao}</div><div className="cell-sub">SIGTAP {p.codigo}</div></td>
                        <td className="num">{formatarNumero(p.quantidade)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
