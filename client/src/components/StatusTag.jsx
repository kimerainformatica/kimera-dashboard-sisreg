import { CheckCircle2, XCircle, CalendarClock, HelpCircle, MinusCircle, Wrench } from 'lucide-react';
import { labelStatusSolicitacao } from './labels.js';

const ICONES = {
  compareceu: CheckCircle2,
  falta: XCircle,
  realizado: Wrench,
  agendado: CalendarClock,
  sem_atualizacao: HelpCircle,
  nao_confirmado: MinusCircle,
};

const DICAS = {
  realizado: 'Procedimento confirmado no SISREG. Não conta como falta nem como comparecimento.',
  nao_confirmado: 'Procedimento pendente no SISREG. Procedimentos não contam como falta.',
};

/** Attendance status of a SISREG solicitação, icon + label. */
export default function StatusTag({ status }) {
  const Icone = ICONES[status] ?? HelpCircle;
  return <span className={`tag sol-${status}`} title={DICAS[status]}><Icone size={11} /> {labelStatusSolicitacao(status)}</span>;
}
