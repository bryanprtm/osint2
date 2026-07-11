import { useMemo } from "react";
import {
  Crosshair, Database, Map, FileSearch, Activity, Settings, LogOut, Shield,
  LayoutGrid, type LucideIcon,
} from "lucide-react";
import defaultLogo from "@/assets/logo.png";
import { useAuth } from "@/lib/auth";

const NAV = [
  { icon: Crosshair, label: "Intelijen", active: true },
  { icon: Database, label: "Database" },
  { icon: Map, label: "Geo-Tracking" },
  { icon: FileSearch, label: "Investigasi" },
  { icon: Activity, label: "Live Feed" },
  { icon: Shield, label: "Keamanan" },
  { icon: Settings, label: "Konfigurasi" },
];

const CAT_ICONS: Record<string, LucideIcon> = {
  "Identitas": Database,
  "Kendaraan": Crosshair,
  "Telekomunikasi": Activity,
  "Biometrik": Shield,
  "Geo & Sinyal": Map,
  "Analitik": FileSearch,
  "Cybersecurity": Shield,
  "Jaringan": Activity,
  "Web Exploit": Crosshair,
  "Password & Kripto": Database,
  "Utilitas": Settings,
};

export interface SidebarProps {
  categories?: string[];
  activeCategory?: string;
  onSelectCategory?: (cat: string) => void;
}

export function Sidebar({ categories, activeCategory, onSelectCategory }: SidebarProps) {
  const showCats = categories && categories.length > 0;

  const catList = useMemo(() => {
    if (!showCats) return [];
    return ["Semua", ...categories];
  }, [showCats, categories]);

  return (
    <aside className="w-16 lg:w-56 shrink-0 border-r border-border bg-sidebar flex flex-col">
      <div className="p-4 border-b border-border flex items-center gap-2.5">
        <div className="w-10 h-10 flex items-center justify-center shrink-0">
          <img src={logo} alt="Logo" className="w-full h-full object-contain drop-shadow-[0_0_8px_rgba(0,229,255,0.35)]" />
        </div>
        <div className="hidden lg:block">
          <div className="text-sm font-bold tracking-wider text-foreground">Den 404 Anti Eror OSINT</div>
          <div className="text-[10px] font-mono text-cyber tracking-widest">PROFILER //ID</div>
        </div>
      </div>

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {showCats ? (
          <>
            <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 mb-2">
              <LayoutGrid className="w-3 h-3 text-cyber" />
              <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-cyber">Kategori</span>
            </div>
            {catList.map((cat) => {
              const Icon = CAT_ICONS[cat] ?? Database;
              const isActive = (cat === "Semua" && !activeCategory) || cat === activeCategory;
              return (
                <button
                  key={cat}
                  onClick={() => onSelectCategory?.(cat === "Semua" ? "" : cat)}
                  className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-sm text-xs font-medium transition-all
                    ${isActive
                      ? "bg-cyber/15 text-cyber border-l-2 border-cyber"
                      : "text-muted-foreground hover:bg-panel-elevated hover:text-foreground border-l-2 border-transparent"}`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden lg:inline tracking-wide truncate">{cat}</span>
                </button>
              );
            })}
          </>
        ) : (
          NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-medium transition-all
                  ${item.active
                    ? "bg-cyber/15 text-cyber border-l-2 border-cyber"
                    : "text-muted-foreground hover:bg-panel-elevated hover:text-foreground border-l-2 border-transparent"}`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden lg:inline tracking-wide">{item.label}</span>
              </button>
            );
          })
        )}
      </nav>

      <div className="p-3 border-t border-border space-y-2">
        <div className="hidden lg:block px-2 py-2 rounded-sm bg-panel-elevated/60 border border-border">
          <div className="text-[10px] font-mono text-muted-foreground">OPERATOR</div>
          <div className="text-xs font-semibold text-foreground">AGENT-007</div>
          <div className="text-[10px] font-mono text-cyber">Clearance Lv.5</div>
        </div>
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-sm text-xs text-muted-foreground hover:text-destructive transition-colors">
          <LogOut className="w-4 h-4" />
          <span className="hidden lg:inline">Disconnect</span>
        </button>
      </div>
    </aside>
  );
}
