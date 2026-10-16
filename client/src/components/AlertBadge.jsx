import { AlertOctagon, Clock, AlertTriangle, CheckCircle2, Archive } from 'lucide-react';

const LABELS = {
  critico: { texto: 'Crítico', classe: 'critical', Icone: AlertOctagon },
  sem_retorno: { texto: 'Sem retorno', classe: 'serious', Icone: Clock },
  faltoso: { texto: 'Faltoso', classe: 'warning', Icone: AlertTriangle },
  em_dia: { texto: 'Em dia', classe: 'nenhum', Icone: CheckCircle2 },
  encerrado: { texto: 'Encerrado', classe: 'neutro', Icone: Archive },
};

// Status colors always ship with icon + label, never color alone.
export default function AlertBadge({ nivel }) {
  const { texto, classe, Icone } = LABELS[nivel] ?? { texto: nivel, classe: 'neutro', Icone: CheckCircle2 };
  return <span className={`badge ${classe}`}><Icone size={11} /> {texto}</span>;
}
