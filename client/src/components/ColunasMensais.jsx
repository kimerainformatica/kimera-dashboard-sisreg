import { useState } from 'react';
import { Table2, BarChart3 } from 'lucide-react';
import { formatarMes, formatarNumero, formatarPct } from './labels.js';

const SERIES = [
  { chave: 'comparecimentos', rotulo: 'Comparecimentos', cor: 'var(--series-blue)' },
  { chave: 'faltas', rotulo: 'Faltas', cor: 'var(--series-orange)' },
];

function tetoLimpo(max) {
  if (max <= 0) return 10;
  const passo = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * passo >= max) return m * passo;
  return 10 * passo;
}

/**
 * Monthly stacked columns: attended (bottom) + missed (top) scheduled
 * appointments. Months inside the selected period stay solid; the rest is
 * context. Hover shows the month; the table view carries every value.
 */
export default function ColunasMensais({ dados, periodo, onSelecionarMes }) {
  const [hover, setHover] = useState(null);
  const [tabela, setTabela] = useState(false);
  if (!dados?.length) return <div className="empty-state">Sem dados para o gráfico.</div>;

  const teto = tetoLimpo(Math.max(...dados.map((d) => d.comparecimentos + d.faltas)));
  const ticks = [0, teto / 2, teto];
  const noPeriodo = (mes) => !periodo?.inicio || (`${mes}-31` >= periodo.inicio && `${mes}-01` <= periodo.fim);

  return (
    <div className="viz">
      <div className="viz-head">
        <div className="viz-legend">
          {SERIES.map((s) => (
            <span key={s.chave}><i style={{ background: s.cor }} />{s.rotulo}</span>
          ))}
        </div>
        <button className="ghost" onClick={() => setTabela((v) => !v)} aria-pressed={tabela}>
          {tabela ? <><BarChart3 size={14} /> Gráfico</> : <><Table2 size={14} /> Tabela</>}
        </button>
      </div>

      {tabela ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Mês</th><th className="num">Agendadas</th><th className="num">Comparecimentos</th><th className="num">Faltas</th><th className="num">Taxa de faltas</th><th className="num">Pacientes atendidos</th></tr></thead>
            <tbody>
              {dados.map((d) => (
                <tr key={d.mes}>
                  <td>{formatarMes(d.mes)}</td>
                  <td className="num">{formatarNumero(d.agendadas)}</td>
                  <td className="num">{formatarNumero(d.comparecimentos)}</td>
                  <td className="num">{formatarNumero(d.faltas)}</td>
                  <td className="num">{formatarPct(d.taxaFaltas, 1)}</td>
                  <td className="num">{formatarNumero(d.pacientesAtendidos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="colunas">
          <div className="colunas-eixo" aria-hidden="true">
            {[...ticks].reverse().map((t) => <span key={t}>{formatarNumero(t)}</span>)}
          </div>
          <div className="colunas-area">
            {ticks.map((t) => <div key={t} className="colunas-grade" style={{ bottom: `${(t / teto) * 100}%` }} />)}
            {dados.map((d) => {
              const total = d.comparecimentos + d.faltas;
              const ativo = noPeriodo(d.mes);
              return (
                <button
                  key={d.mes}
                  type="button"
                  className={`coluna${ativo ? '' : ' fora'}${hover === d.mes ? ' hover' : ''}`}
                  onMouseEnter={() => setHover(d.mes)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(d.mes)}
                  onBlur={() => setHover(null)}
                  onClick={() => onSelecionarMes?.(d.mes)}
                  aria-label={`${formatarMes(d.mes)}: ${d.comparecimentos} comparecimentos, ${d.faltas} faltas`}
                  title={onSelecionarMes ? 'Clique para filtrar este mês' : undefined}
                >
                  <span className="coluna-valor">{formatarNumero(total)}</span>
                  <span className="coluna-pilha" style={{ height: `${(total / teto) * 100}%` }}>
                    <i className="seg faltas" style={{ flexGrow: d.faltas, background: 'var(--series-orange)' }} />
                    <i className="seg" style={{ flexGrow: d.comparecimentos, background: 'var(--series-blue)' }} />
                  </span>
                  {hover === d.mes && (
                    <span className="viz-tooltip" role="tooltip">
                      <strong>{formatarMes(d.mes)}</strong>
                      <span><i style={{ background: 'var(--series-blue)' }} />Comparecimentos <b>{formatarNumero(d.comparecimentos)}</b></span>
                      <span><i style={{ background: 'var(--series-orange)' }} />Faltas <b>{formatarNumero(d.faltas)}</b></span>
                      <span className="muted">Taxa de faltas {formatarPct(d.taxaFaltas, 1)}</span>
                      {d.semAtualizacao > 0 && <span className="muted">{d.semAtualizacao} sem atualização</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div />
          <div className="colunas-rotulos">
            {dados.map((d) => (
              <span key={d.mes} className={noPeriodo(d.mes) ? '' : 'fora'}>
                {formatarMes(d.mes)}
                <small>{formatarPct(d.taxaFaltas, 1)} faltas</small>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
