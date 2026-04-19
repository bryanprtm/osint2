import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Sidebar } from "@/components/osint/Sidebar";
import { StatusBar } from "@/components/osint/StatusBar";
import { FeatureGrid } from "@/components/osint/FeatureGrid";
import { QueryConsole } from "@/components/osint/QueryConsole";
import { ResultsPanel } from "@/components/osint/ResultsPanel";
import { FEATURES, generateMockResult, type Feature, type OsintResult } from "@/lib/osint-data";
import { Info } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "JCD OSINT — Command Center" },
      { name: "description", content: "Dashboard intelijen OSINT terintegrasi: identitas, kendaraan, telekomunikasi, biometrik, geo-sinyal, dan analitik." },
    ],
  }),
});

function Dashboard() {
  const [feature, setFeature] = useState<Feature>(FEATURES[0]);
  const [result, setResult] = useState<OsintResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (q: string) => {
    setLoading(true);
    setResult(null);
    setTimeout(() => {
      setResult(generateMockResult(feature.id, q));
      setLoading(false);
    }, 850);
  };

  const stats = [
    { label: "Modul Aktif", value: FEATURES.length, accent: "text-cyber" },
    { label: "Query Hari Ini", value: "1,284", accent: "text-success" },
    { label: "Sumber Data", value: "12", accent: "text-cyber" },
    { label: "Uptime", value: "99.98%", accent: "text-success" },
  ];

  return (
    <div className="min-h-screen flex w-full">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <StatusBar />

        <header className="px-6 py-4 border-b border-border">
          <div className="flex items-baseline justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                OSINT <span className="text-cyber text-glow">Profiler</span> Indonesia
              </h1>
              <p className="text-xs font-mono text-muted-foreground tracking-wider mt-1">
                COMMAND CENTER · OPEN SOURCE INTELLIGENCE PLATFORM
              </p>
            </div>
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-cyber/40 text-cyber text-xs font-mono tracking-wider hover:bg-cyber/10 transition-colors">
              <Info className="w-3.5 h-3.5" /> PANDUAN OPERASIONAL
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
            {stats.map((s) => (
              <div key={s.label} className="panel-frame rounded-sm px-3 py-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{s.label}</div>
                <div className={`text-xl font-bold font-mono ${s.accent} text-glow`}>{s.value}</div>
              </div>
            ))}
          </div>
        </header>

        <main className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-12 gap-4">
          <section className="xl:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-mono uppercase tracking-[0.3em] text-cyber">
                ▸ Modul Intelijen
              </h2>
              <span className="text-[10px] font-mono text-muted-foreground">
                {FEATURES.length} modul · klik untuk aktifkan
              </span>
            </div>
            <FeatureGrid active={feature.id} onSelect={setFeature} />
          </section>

          <section className="xl:col-span-5 space-y-4">
            <QueryConsole feature={feature} onSubmit={handleSubmit} loading={loading} />
            <ResultsPanel result={result} loading={loading} />
          </section>
        </main>

        <footer className="px-6 py-3 border-t border-border text-[10px] font-mono text-muted-foreground flex justify-between">
          <span>JCD OSINT v2.4.1 · Authorized personnel only</span>
          <span className="text-cyber">SESSION: A7F3-9921-XK</span>
        </footer>
      </div>
    </div>
  );
}
