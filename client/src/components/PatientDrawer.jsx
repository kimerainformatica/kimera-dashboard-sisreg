import { useEffect, useState } from 'react';
import { X, Phone, CalendarClock, AlertTriangle, Clock, Save, Layers, MapPin, ClipboardList } from 'lucide-react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import AlertBadge from './AlertBadge.jsx';
import StatusTag from './StatusTag.jsx';
import {
  STATUS_ACOMPANHAMENTO, formatarData, formatarDataHora, formatarPct, nomeProprio, listarTelefones,
} from './labels.js';

function Linha({ rotulo, children }) {
  return (
    <div className="kv">
      <span className="kv-label">{rotulo}</span>
      <span className="kv-value">{children ?? '—'}</span>
    </div>
  );
}

/**
 * Side panel with the full reading of one patient in a specialty: identity,
 * why the alert fired, the SISREG history, other specialties and the team's
 * own follow-up notes (the only editable part — SISREG data is read-only).
 */
export default function PatientDrawer({ slug, pacienteId, onFechar, onAlterado }) {
  const toast = useToast();
  const [p, setP] = useState(null);
  const [erro, setErro] = useState(null);
  const [acomp, setAcomp] = useState({ status: '', observacoes: '' });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setP(null);
    setErro(null);
    api.especialidades.paciente(slug, pacienteId)
      .then((dados) => {
        setP(dados);
        setAcomp({ status: dados.acompanhamento?.status ?? '', observacoes: dados.acompanhamento?.observacoes ?? '' });
      })
      .catch((e) => setErro(e.message));
  }, [slug, pacienteId]);

  useEffect(() => {
    const aoTeclar = (e) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  async function salvarAcompanhamento(e) {
    e.preventDefault();
    setSalvando(true);
    try {
      const dados = await api.especialidades.salvarAcompanhamento(slug, pacienteId, acomp);
      setP(dados);
      toast.success('Acompanhamento salvo.');
      onAlterado?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSalvando(false);
    }
  }

  const cfg = p?.configuracao;
  const motivos = p?.alertas ? [
    p.alertas.critico && `${p.faltasConsecutivas} faltas seguidas (limite: ${cfg.faltas_alerta_criticas})`,
    p.alertas.semRetorno && `${p.diasSemRetorno} dias sem comparecer e sem agendamento futuro (limite: ${cfg.dias_sem_retorno_alerta})`,
    p.faltas > 0 && !p.alertas.critico && `${p.faltas} falta(s) no período considerado`,
    p.semAtualizacao > 0 && `${p.semAtualizacao} consulta(s) sem atualização — importe uma exportação mais nova`,
  ].filter(Boolean) : [];
  const endereco = p && [p.tipo_logradouro, p.logradouro, p.numero && `nº ${p.numero}`, p.complemento].filter(Boolean).join(' ');

  return (
    <>
      <div className="drawer-backdrop" onClick={onFechar} />
      <aside className="drawer" role="dialog" aria-label="Detalhes do paciente">
        <div className="drawer-head">
          <div>
            {p ? (
              <>
                <h3 style={{ margin: 0 }}>{nomeProprio(p.nome)}</h3>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  CNS {p.cns}{p.idade != null ? ` · ${p.idade} anos` : ''}{p.sexo ? ` · ${p.sexo === 'F' ? 'Feminino' : 'Masculino'}` : ''}
                </div>
              </>
            ) : <h3 style={{ margin: 0 }}>{erro ? 'Erro' : 'Carregando…'}</h3>}
          </div>
          <button className="ghost icon-btn" onClick={onFechar} aria-label="Fechar"><X size={16} /></button>
        </div>

        {erro && <p className="error-text" style={{ padding: '0 20px' }}><AlertTriangle size={13} /> {erro}</p>}

        {p && (
          <div className="drawer-body">
            {p.nivel && (
              <div className="drawer-alert">
                <AlertBadge nivel={p.nivel} />
                {motivos.length > 0
                  ? <ul>{motivos.map((m) => <li key={m}>{m}</li>)}</ul>
                  : <span className="muted" style={{ fontSize: 12 }}>Nenhuma pendência até {formatarData(p.referencia)}.</span>}
              </div>
            )}

            <div className="kv-grid">
              <Linha rotulo="Telefones">
                {listarTelefones(p.telefones).length > 0 && listarTelefones(p.telefones).map((t) => (
                  <a key={t} href={`tel:${t.replace(/\D/g, '')}`} style={{ marginRight: 8 }}><Phone size={11} /> {t}</a>
                ))}
              </Linha>
              <Linha rotulo="Nascimento">{p.data_nascimento && formatarData(p.data_nascimento)}</Linha>
              <Linha rotulo="Mãe">{p.nome_mae && nomeProprio(p.nome_mae)}</Linha>
              <Linha rotulo="Município / bairro">{[p.municipio, p.bairro].filter(Boolean).join(' · ') || null}</Linha>
              <Linha rotulo="Endereço">{endereco ? <><MapPin size={11} /> {endereco}{p.cep ? ` — CEP ${p.cep}` : ''}</> : null}</Linha>
              <Linha rotulo="Cadastro atualizado em">{formatarData(p.dados_em)}</Linha>
            </div>

            {p.nivel && (
              <>
                <div className="card-title" style={{ marginTop: 16 }}><Clock size={15} /> Tratamento nesta especialidade</div>
                <div className="kv-grid">
                  <Linha rotulo="Profissional (mais recente)">{p.profissional_nome && nomeProprio(p.profissional_nome)}</Linha>
                  <Linha rotulo="Primeira visita (dados importados)">{p.primeiraVisita && formatarData(p.primeiraVisita)}</Linha>
                  <Linha rotulo="Última visita">{p.ultimaVisita && formatarData(p.ultimaVisita)}</Linha>
                  <Linha rotulo="Próximo agendamento">{p.proximoAgendamento && formatarData(p.proximoAgendamento)}</Linha>
                  <Linha rotulo="Consultas: comparecimentos / faltas">{`${p.comparecimentos} / ${p.faltas}`}{p.faltasHistorico !== p.faltas ? ` (${p.faltasHistorico} no histórico)` : ''}</Linha>
                  <Linha rotulo="Comparecimento nas consultas">{formatarPct(p.taxaComparecimento)}</Linha>
                  <Linha rotulo="Dias sem retorno">{p.diasSemRetorno}</Linha>
                  {slug === 'ortodontia' && (
                    <Linha rotulo="Aparelho">
                      {p.instalacao ? `${p.instalacao.tipo === 'fixo' ? 'Fixo' : 'Removível'} — instalado em ${formatarData(p.instalacao.data)}` : 'sem instalação nos dados'}
                      {p.manutencoes ? ` · ${p.manutencoes} manutenç${p.manutencoes === 1 ? 'ão' : 'ões'}` : ''}
                    </Linha>
                  )}
                </div>
              </>
            )}

            <form onSubmit={salvarAcompanhamento} className="acompanhamento">
              <div className="card-title" style={{ marginTop: 16 }}><ClipboardList size={15} /> Acompanhamento da equipe</div>
              <div className="form-row">
                <label htmlFor="acomp-status">Situação do tratamento</label>
                <select id="acomp-status" value={acomp.status} onChange={(e) => setAcomp((a) => ({ ...a, status: e.target.value }))}>
                  <option value="">Não informado (segue os dados do SISREG)</option>
                  {STATUS_ACOMPANHAMENTO.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="form-row">
                <label htmlFor="acomp-obs">Observações (contatos feitos, motivo de faltas…)</label>
                <textarea id="acomp-obs" rows={3} maxLength={5000} value={acomp.observacoes} onChange={(e) => setAcomp((a) => ({ ...a, observacoes: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span className="muted" style={{ fontSize: 11 }}>
                  {p.acompanhamento ? `Atualizado em ${formatarDataHora(p.acompanhamento.atualizado_em)}${p.acompanhamento.atualizado_por ? ` por ${p.acompanhamento.atualizado_por}` : ''}` : 'Concluído, abandonou ou transferido tira o paciente dos alertas.'}
                </span>
                <button type="submit" disabled={salvando}><Save size={14} /> {salvando ? 'Salvando…' : 'Salvar'}</button>
              </div>
            </form>

            <div className="card-title" style={{ marginTop: 18 }}><CalendarClock size={15} /> Histórico no SISREG ({p.historico.length})</div>
            {p.historico.length === 0 ? (
              <p className="muted" style={{ fontSize: 12 }}>Nenhuma solicitação nesta especialidade.</p>
            ) : (
              <div className="timeline">
                {p.historico.map((s) => (
                  <div key={s.id} className={`timeline-item ${s.status}`}>
                    <span className="dot" />
                    <div className="timeline-main">
                      <div><strong>{formatarDataHora(s.data_hora)}</strong> <span className="muted">· {nomeProprio(s.profissional_nome)}</span></div>
                      <div className="muted" style={{ fontSize: 12 }}>{s.procedimentos.map((i) => i.descricao).join(' · ')}</div>
                      <div className="cell-sub">Solicitação {s.id}</div>
                    </div>
                    <StatusTag status={s.status} />
                  </div>
                ))}
              </div>
            )}

            {p.outrasEspecialidades?.length > 0 && (
              <>
                <div className="card-title" style={{ marginTop: 18 }}><Layers size={15} /> Outras especialidades</div>
                <table>
                  <thead><tr><th>Especialidade</th><th className="num">Solicitações</th><th className="num">Faltas</th><th>Última</th></tr></thead>
                  <tbody>
                    {p.outrasEspecialidades.map((o) => (
                      <tr key={o.slug ?? 'sem'}>
                        <td>{o.nome ?? 'Sem especialidade'}</td>
                        <td className="num">{o.solicitacoes}</td>
                        <td className="num">{o.faltas}</td>
                        <td>{formatarData(o.ultima)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
