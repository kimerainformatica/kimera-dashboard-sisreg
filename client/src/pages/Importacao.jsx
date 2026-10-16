import { useEffect, useRef, useState } from 'react';
import { Upload, FileText, CheckCircle2, AlertTriangle, Loader2, X, History, CalendarRange, Info } from 'lucide-react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { formatarData, formatarDataHora, formatarMes, formatarNumero } from '../components/labels.js';

/**
 * SISREG import: each selected file is analysed (nothing written), the user
 * reviews what will change and confirms. Files are confirmed oldest export
 * first so newer situations always win.
 */
export default function Importacao() {
  const toast = useToast();
  const inputRef = useRef(null);
  const [itens, setItens] = useState([]);
  const [arrastando, setArrastando] = useState(false);
  const [historico, setHistorico] = useState([]);
  const [cobertura, setCobertura] = useState([]);

  function carregarHistorico() {
    api.importacoes.listar({ limite: 30 }).then(setHistorico).catch(() => {});
    api.importacoes.cobertura().then(setCobertura).catch(() => {});
  }
  useEffect(carregarHistorico, []);

  const atualizar = (id, mudancas) => setItens((lista) => lista.map((i) => (i.id === id ? { ...i, ...mudancas } : i)));

  async function adicionar(arquivos) {
    const novos = [...arquivos]
      .filter((f) => /\.(csv|txt)$/i.test(f.name))
      .map((f) => ({ id: `${f.name}-${f.size}-${Math.random()}`, arquivo: f, estado: 'analisando' }));
    if (!novos.length) {
      toast.error('Selecione o(s) arquivo(s) .csv exportado(s) do SISREG.');
      return;
    }
    setItens((lista) => [...lista, ...novos]);
    for (const item of novos) {
      try {
        const analise = await api.importacoes.analisar(item.arquivo);
        atualizar(item.id, { estado: 'analisado', analise, exportadoEm: analise.exportadoEm });
      } catch (e) {
        atualizar(item.id, { estado: 'erro', erro: e.message });
      }
    }
  }

  async function confirmar(item) {
    atualizar(item.id, { estado: 'importando' });
    try {
      const r = await api.importacoes.confirmar(item.analise.token, item.exportadoEm);
      atualizar(item.id, { estado: 'importado', resultado: r });
      toast.success(`${item.arquivo.name}: ${formatarNumero(r.novas)} novas e ${formatarNumero(r.atualizadas)} atualizadas.`);
      carregarHistorico();
    } catch (e) {
      atualizar(item.id, { estado: 'erro', erro: e.message });
    }
  }

  async function confirmarTodos() {
    const pendentes = itens
      .filter((i) => i.estado === 'analisado')
      .sort((a, b) => a.exportadoEm.localeCompare(b.exportadoEm) || (a.analise.periodo.inicio ?? '').localeCompare(b.analise.periodo.inicio ?? ''));
    for (const item of pendentes) await confirmar(item);
  }

  const prontos = itens.filter((i) => i.estado === 'analisado').length;

  return (
    <div>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Importar SISREG</h2>
      </div>

      <div className="card">
        <div className="info-box">
          <Info size={15} />
          <span>
            No SISREG, exporte os <strong>agendamentos da unidade executante</strong> (um arquivo por mês). Pode enviar vários de uma vez.
            Reimportar um mês já carregado só atualiza a situação (pendente → confirmado) e o cadastro dos pacientes — nada é duplicado.
          </span>
        </div>
        <div
          className={`dropzone${arrastando ? ' dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); adicionar(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        >
          <Upload size={22} />
          <div><strong>Arraste os arquivos .csv aqui</strong> ou clique para escolher</div>
          <input ref={inputRef} type="file" accept=".csv,.txt" multiple hidden onChange={(e) => { adicionar(e.target.files); e.target.value = ''; }} />
        </div>

        {itens.length > 0 && (
          <div className="import-lista">
            {itens.map((item) => <ItemImportacao key={item.id} item={item} onData={(v) => atualizar(item.id, { exportadoEm: v })} onConfirmar={() => confirmar(item)} onRemover={() => setItens((l) => l.filter((x) => x.id !== item.id))} />)}
            <div className="modal-actions">
              <button className="ghost" onClick={() => setItens((l) => l.filter((i) => !['importado', 'erro'].includes(i.estado)))}>Limpar concluídos</button>
              <button disabled={!prontos} onClick={confirmarTodos}><CheckCircle2 size={14} /> Importar {prontos > 1 ? `todos (${prontos})` : ''}</button>
            </div>
          </div>
        )}
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-title"><CalendarRange size={15} /> Meses carregados</div>
          <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>Para saber se um agendamento virou falta, a exportação precisa ter sido feita depois do fim do mês.</p>
          <table>
            <thead><tr><th>Mês</th><th className="num">Solicitações</th><th>Exportado em</th><th className="num">Sem desfecho</th></tr></thead>
            <tbody>
              {cobertura.length === 0 && <tr><td colSpan={4} className="muted">Nenhum dado importado ainda.</td></tr>}
              {cobertura.map((c) => (
                <tr key={c.mes}>
                  <td>{formatarMes(c.mes)}</td>
                  <td className="num">{formatarNumero(c.solicitacoes)}</td>
                  <td>{formatarData(c.exportado_em)}</td>
                  <td className="num">
                    {c.sem_desfecho > 0
                      ? <span className="tag aviso" title="Consultas pendentes cuja data não tinha passado quando o arquivo foi exportado. Reexporte o mês para saber se foram faltas."><AlertTriangle size={11} /> {formatarNumero(c.sem_desfecho)}</span>
                      : <span className="tag ativo"><CheckCircle2 size={11} /> 0</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-title"><History size={15} /> Histórico de importações</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Quando</th><th>Arquivo</th><th className="num">Novas</th><th className="num">Atualiz.</th></tr></thead>
              <tbody>
                {historico.length === 0 && <tr><td colSpan={4} className="muted">Nenhuma importação.</td></tr>}
                {historico.map((h) => (
                  <tr key={h.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatarDataHora(h.criado_em)}<div className="cell-sub">{h.usuario ?? 'linha de comando'}</div></td>
                    <td><div style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{h.arquivo}</div><div className="cell-sub">{formatarData(h.periodo_inicio)} a {formatarData(h.periodo_fim)} · exportado {formatarData(h.exportado_em)}</div></td>
                    <td className="num">{formatarNumero(h.solicitacoes_novas)}</td>
                    <td className="num">{formatarNumero(h.solicitacoes_atualizadas)}{h.situacoes_alteradas > 0 && <div className="cell-sub">{h.situacoes_alteradas} mudaram</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemImportacao({ item, onData, onConfirmar, onRemover }) {
  const a = item.analise;
  return (
    <div className={`import-item ${item.estado}`}>
      <div className="import-item-head">
        <FileText size={16} />
        <strong style={{ overflowWrap: 'anywhere' }}>{item.arquivo.name}</strong>
        <span className="muted" style={{ fontSize: 12 }}>{(item.arquivo.size / 1024 / 1024).toFixed(1)} MB</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {item.estado === 'analisando' && <span className="tag"><Loader2 size={11} className="girando" /> Analisando…</span>}
          {item.estado === 'importando' && <span className="tag"><Loader2 size={11} className="girando" /> Importando…</span>}
          {item.estado === 'importado' && <span className="tag ativo"><CheckCircle2 size={11} /> Importado</span>}
          {item.estado === 'erro' && <span className="tag erro"><AlertTriangle size={11} /> Erro</span>}
          {['analisado', 'erro'].includes(item.estado) && <button className="ghost icon-btn" onClick={onRemover} aria-label="Remover da lista"><X size={14} /></button>}
        </span>
      </div>

      {item.erro && <p className="error-text" style={{ margin: '6px 0 0' }}>{item.erro}</p>}

      {a && (
        <>
          <div className="detection-strip" style={{ marginTop: 8 }}>
            <span className="chip">Agendamentos de {formatarData(a.periodo.inicio)} a {formatarData(a.periodo.fim)}</span>
            <span className="chip">{formatarNumero(a.totalLinhas)} linhas · {formatarNumero(a.totalSolicitacoes)} solicitações</span>
            <span className="chip">{formatarNumero(a.pacientes)} pacientes ({formatarNumero(a.pacientesNovos)} novos)</span>
            <span className="chip">{a.codificacao}</span>
          </div>
          <div className="stat-grid compact" style={{ marginBottom: 10 }}>
            <Mini rotulo="Novas" valor={a.novas} />
            <Mini rotulo="Atualizadas" valor={a.atualizadas} />
            <Mini rotulo="Pendente → confirmado" valor={a.mudancas.pendente_para_confirmado} />
            <Mini rotulo="Ignoradas (já há exportação mais nova)" valor={a.ignoradas} />
            <Mini rotulo="Linhas com erro" valor={a.totalErros} tone={a.totalErros ? 'warning' : undefined} />
          </div>

          <details className="advanced">
            <summary>Por especialidade ({a.porEspecialidade.length})</summary>
            <table>
              <thead><tr><th>Especialidade</th><th className="num">Consultas</th><th className="num">Pendentes</th><th className="num">Procedimentos</th></tr></thead>
              <tbody>
                {a.porEspecialidade.map((e) => (
                  <tr key={e.slug ?? 'sem'}><td>{e.nome}</td><td className="num">{formatarNumero(e.agendados)}</td><td className="num">{formatarNumero(e.pendentes)}</td><td className="num">{formatarNumero(e.procedimentos)}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
          {a.procedimentosNovos.length > 0 && (
            <details className="advanced" open={a.procedimentosNovos.some((p) => !p.especialidade)}>
              <summary>Procedimentos novos ({a.procedimentosNovos.length}){a.procedimentosNovos.some((p) => !p.especialidade) ? ' — há códigos sem especialidade, classifique em Configurações → Procedimentos' : ''}</summary>
              <table>
                <thead><tr><th>Código</th><th>Descrição</th><th>Especialidade sugerida</th></tr></thead>
                <tbody>
                  {a.procedimentosNovos.map((p) => (
                    <tr key={p.codigo_interno}><td>{p.codigo_interno}</td><td>{p.descricao}</td><td>{p.especialidade_nome ?? <span className="tag aviso">sem especialidade</span>}</td></tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
          {a.erros.length > 0 && (
            <details className="advanced">
              <summary>Linhas com erro ({a.totalErros}) — não serão importadas</summary>
              <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
                {a.erros.slice(0, 50).map((e) => <li key={`${e.linha}-${e.motivo}`}>Linha {e.linha}: {e.motivo}</li>)}
              </ul>
            </details>
          )}

          {item.estado === 'analisado' && (
            <div className="filter-bar" style={{ marginBottom: 0, marginTop: 8 }}>
              <div className="filter-field">
                <label htmlFor={`exp-${item.id}`}>Data em que o arquivo foi exportado</label>
                <input id={`exp-${item.id}`} type="date" value={item.exportadoEm} onChange={(e) => onData(e.target.value)} />
              </div>
              <span className="muted" style={{ fontSize: 12, alignSelf: 'center', maxWidth: 380 }}>
                {a.exportadoEmDoNome ? 'Lida do nome do arquivo.' : 'O nome do arquivo não traz a data — confira.'} Consultas pendentes antes desta data contam como falta.
              </span>
              <button style={{ marginLeft: 'auto' }} onClick={onConfirmar}><CheckCircle2 size={14} /> Importar este arquivo</button>
            </div>
          )}
          {item.resultado && (
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
              Gravado em {(item.resultado.duracao_ms / 1000).toFixed(1)} s: {formatarNumero(item.resultado.solicitacoes_novas)} novas, {formatarNumero(item.resultado.solicitacoes_atualizadas)} atualizadas, {formatarNumero(item.resultado.pacientes_novos)} pacientes novos.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Mini({ rotulo, valor, tone }) {
  return (
    <div className="stat-tile">
      <div className="label">{rotulo}</div>
      <div className={`value${tone ? ` ${tone}` : ''}`}>{formatarNumero(valor)}</div>
    </div>
  );
}
