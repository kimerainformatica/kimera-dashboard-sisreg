import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const ICONES = { success: CheckCircle2, error: AlertCircle, info: Info };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const proximoId = useRef(0);

  const remover = useCallback((id) => {
    setToasts((atuais) => atuais.filter((t) => t.id !== id));
  }, []);

  const notificar = useCallback((mensagem, tipo = 'info', duracao = 4500) => {
    const id = ++proximoId.current;
    setToasts((atuais) => [...atuais, { id, mensagem, tipo }]);
    if (duracao) setTimeout(() => remover(id), duracao);
    return id;
  }, [remover]);

  const api = useRef({
    success: (msg) => notificar(msg, 'success'),
    error: (msg) => notificar(msg, 'error', 7000),
    info: (msg) => notificar(msg, 'info'),
  }).current;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => {
          const Icone = ICONES[t.tipo] ?? Info;
          return (
            <div key={t.id} className={`toast ${t.tipo}`} role="status">
              <Icone size={16} />
              <span>{t.mensagem}</span>
              <button className="toast-close" onClick={() => remover(t.id)} aria-label="Fechar">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>');
  return ctx;
}
