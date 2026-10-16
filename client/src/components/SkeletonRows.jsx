export default function SkeletonRows({ columns, rows = 6 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr className="skeleton-row" key={r}>
          {Array.from({ length: columns }).map((__, c) => (
            <td key={c}>
              <span className="skeleton skeleton-line" style={{ width: `${55 + ((r + c) % 4) * 12}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
