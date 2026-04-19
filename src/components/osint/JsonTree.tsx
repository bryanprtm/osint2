type Props = { data: unknown; level?: number };

function Row({ k, v, level }: { k: string; v: unknown; level: number }) {
  const isPrimitive = v === null || ["string", "number", "boolean"].includes(typeof v);
  return (
    <div className="border-l border-cyber/20" style={{ paddingLeft: 16, marginLeft: level * 8 }}>
      {isPrimitive ? (
        <div className="flex items-baseline justify-between gap-4 py-2 border-b border-border/40">
          <span className="text-xs font-mono uppercase tracking-wider text-cyber">{k}</span>
          <span className="text-sm font-mono text-foreground text-right break-all">{String(v)}</span>
        </div>
      ) : (
        <div className="py-2">
          <div className="text-xs font-mono uppercase tracking-wider text-cyber mb-1">
            {Array.isArray(v) ? `[ ${k} ]` : `{ ${k} }`}
          </div>
          <JsonTree data={v} level={level + 1} />
        </div>
      )}
    </div>
  );
}

export function JsonTree({ data, level = 0 }: Props) {
  if (data === null || data === undefined) return <span className="font-mono text-muted-foreground">null</span>;
  if (Array.isArray(data)) {
    return (
      <div>
        {data.map((item, i) => (
          <Row key={i} k={`[ ${i} ]`} v={item} level={level} />
        ))}
      </div>
    );
  }
  if (typeof data === "object") {
    return (
      <div>
        {Object.entries(data as Record<string, unknown>).map(([k, v]) => (
          <Row key={k} k={k} v={v} level={level} />
        ))}
      </div>
    );
  }
  return <span className="font-mono">{String(data)}</span>;
}
