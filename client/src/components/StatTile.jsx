export default function StatTile({ label, value, tone, icon: Icon, onClick, active, hint }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={`stat-tile${onClick ? ' clickable' : ''}${active ? ' active' : ''}`}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      title={onClick ? 'Clique para filtrar' : undefined}
    >
      <div className="label">{Icon && <Icon size={13} />}{label}</div>
      <div className={`value${tone ? ` ${tone}` : ''}`}>{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </Tag>
  );
}
