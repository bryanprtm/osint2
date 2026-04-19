import { FEATURES, type Feature } from "@/lib/osint-data";

export function FeatureGrid({ active, onSelect }: { active: string; onSelect: (f: Feature) => void }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
      {FEATURES.map((f) => {
        const Icon = f.icon;
        const isActive = f.id === active;
        return (
          <button
            key={f.id}
            onClick={() => onSelect(f)}
            className={`group relative text-left p-3 rounded-sm border transition-all corner-brackets
              ${isActive
                ? "border-cyber bg-cyber/10 glow-cyber"
                : "border-border bg-panel/50 hover:border-cyber/60 hover:bg-panel-elevated"}`}
          >
            <div className="flex items-start gap-2.5">
              <div className={`p-1.5 rounded-sm ${isActive ? "bg-cyber/20 text-cyber" : "bg-secondary text-muted-foreground group-hover:text-cyber"}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-mono text-cyber/80">{f.code}</div>
                <div className="text-xs font-semibold tracking-wide text-foreground truncate">{f.name}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{f.desc}</div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
