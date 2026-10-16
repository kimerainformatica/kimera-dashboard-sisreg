import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

const OPCOES_TAMANHO = [25, 50, 100, 200];

export default function Pagination({ page, pageSize, total, totalPages, onPageChange, onPageSizeChange }) {
  if (total === 0) return null;
  const inicio = (page - 1) * pageSize + 1;
  const fim = Math.min(total, page * pageSize);

  return (
    <div className="pagination">
      <span>
        {inicio.toLocaleString('pt-BR')}–{fim.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')}
        {onPageSizeChange && (
          <>
            {' '}·{' '}
            <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} aria-label="Itens por página">
              {OPCOES_TAMANHO.map((n) => (
                <option key={n} value={n}>{n} por página</option>
              ))}
            </select>
          </>
        )}
      </span>
      <div className="pagination-controls">
        <button className="ghost icon-btn" disabled={page <= 1} onClick={() => onPageChange(1)} aria-label="Primeira página">
          <ChevronsLeft size={15} />
        </button>
        <button className="ghost icon-btn" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Página anterior">
          <ChevronLeft size={15} />
        </button>
        <span>Página {page} de {totalPages}</span>
        <button className="ghost icon-btn" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Próxima página">
          <ChevronRight size={15} />
        </button>
        <button className="ghost icon-btn" disabled={page >= totalPages} onClick={() => onPageChange(totalPages)} aria-label="Última página">
          <ChevronsRight size={15} />
        </button>
      </div>
    </div>
  );
}
