import { useEffect, useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import { api } from '../api.js';
import { formatarData } from './labels.js';

/** "How we calculate" panel — pulls the rule texts with the thresholds in force. */
export default function DefinicoesPanel({ slug, onFechar }) {
  const [def, setDef] = useState(null);
  const [erro, setErro] = useState(null);
  useEffect(() => { api.especialidades.definicoes(slug).then(setDef).catch((e) => setErro(e.message)); }, [slug]);

  useEffect(() => {
    const aoTeclar = (e) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  return (
    <div className="modal-backdrop" onClick={onFechar}>
      <div className="modal" style={{ width: 600 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Como calculamos">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}><BookOpen size={17} /> Como os indicadores são calculados</h3>
          <button className="ghost icon-btn" onClick={onFechar} aria-label="Fechar"><X size={16} /></button>
        </div>
        {erro && <p className="error-text">{erro}</p>}
        {!def && !erro ? <p className="muted">Carregando…</p> : def && (
          <dl className="definicoes">
            {def.regras.map((r) => (
              <div key={r.chave}>
                <dt>{r.titulo}</dt>
                <dd>{r.texto}</dd>
              </div>
            ))}
          </dl>
        )}
        {def && <p className="muted" style={{ fontSize: 12 }}>Data de referência atual: {formatarData(def.referencia)}. Os limites vêm de Configurações.</p>}
      </div>
    </div>
  );
}
