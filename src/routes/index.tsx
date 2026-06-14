import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/osint/Sidebar";
import { StatusBar } from "@/components/osint/StatusBar";
import { FeatureGrid } from "@/components/osint/FeatureGrid";
import { QueryConsole } from "@/components/osint/QueryConsole";
import { ResultsPanel } from "@/components/osint/ResultsPanel";
import { generateMockResult, type Feature, type OsintResult } from "@/lib/osint-data";
import { useAuth, storedToFeature } from "@/lib/auth";
import { lookupNik2KK, lookupImei, lookupBpjs, lookupNopol, lookupMahasiswa, lookupGuru } from "@/lib/lookup.functions";
import { useServerFn } from "@tanstack/react-start";
import { BpjsConsole } from "@/components/osint/BpjsConsole";
import { Info, LogOut, ShieldCheck, Send } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Den 404 Anti Eror OSINT — Command Center" },
      { name: "description", content: "Dashboard intelijen OSINT terintegrasi: identitas, kendaraan, telekomunikasi, biometrik, geo-sinyal, dan analitik." },
    ],
  }),
});

function Dashboard() {
  const { ready, user, modules, settings, logout } = useAuth();
  const navigate = useNavigate();

  const [activeCategory, setActiveCategory] = useState<string>("");

  const visibleFeatures: Feature[] = useMemo(
    () => modules.filter((m) => m.enabled).map(storedToFeature),
    [modules],
  );

  const categories = useMemo(() => {
    const set = new Set(visibleFeatures.map((f) => f.category));
    return Array.from(set).sort();
  }, [visibleFeatures]);

  const filteredFeatures = useMemo(() => {
    if (!activeCategory) return visibleFeatures;
    return visibleFeatures.filter((f) => f.category === activeCategory);
  }, [visibleFeatures, activeCategory]);

  const [feature, setFeature] = useState<Feature | null>(null);
  const [result, setResult] = useState<OsintResult | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = useServerFn(lookupNik2KK);
  const lookupImeiFn = useServerFn(lookupImei);
  const lookupBpjsFn = useServerFn(lookupBpjs);
  const lookupNopolFn = useServerFn(lookupNopol);
  const lookupMahasiswaFn = useServerFn(lookupMahasiswa);
  const lookupGuruFn = useServerFn(lookupGuru);

  const handleBpjsSubmit = async (payload: { nik: string; captcha: string; sessionId: string }) => {
    if (!feature) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await lookupBpjsFn({ data: payload });
      const safe = res ?? { ok: false, message: "Tidak ada respons dari server", rows: [] };
      const rows = Array.isArray(safe.rows) ? safe.rows : [];
      setResult({
        status: !!safe.ok,
        query: payload.nik,
        feature: feature.id,
        timestamp: new Date().toISOString(),
        data: safe.ok && rows.length > 0
          ? rows
          : [{ STATUS: safe.ok ? "OK" : "GAGAL", PESAN: safe.message ?? "Tidak ada data", QUERY: payload.nik }],
      });
    } catch (e) {
      setResult({
        status: false,
        query: payload.nik,
        feature: feature.id,
        timestamp: new Date().toISOString(),
        data: [{ STATUS: "ERROR", PESAN: (e as Error).message, QUERY: payload.nik }],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready && !user) navigate({ to: "/login" });
  }, [ready, user, navigate]);

  useEffect(() => {
    if (!feature && filteredFeatures.length > 0) setFeature(filteredFeatures[0]);
    else if (feature && !filteredFeatures.some((f) => f.id === feature.id)) {
      setFeature(filteredFeatures[0] ?? null);
    }
  }, [filteredFeatures, feature]);

  const handleSubmit = async (q: string) => {
    if (!feature) return;
    setLoading(true);
    setResult(null);

    if (feature.id === "imei" || feature.id === "nopol" || feature.id === "mahasiswa") {
      const fn = feature.id === "imei" ? lookupImeiFn : feature.id === "nopol" ? lookupNopolFn : lookupMahasiswaFn;
      try {
        const res = await fn({ data: { query: q } });
        const safe = res ?? { ok: false, message: "Tidak ada respons dari server", rows: [] };
        const rows = Array.isArray(safe.rows) ? safe.rows : [];
        setResult({
          status: !!safe.ok,
          query: q,
          feature: feature.id,
          timestamp: new Date().toISOString(),
          data: safe.ok && rows.length > 0
            ? rows
            : [{ STATUS: safe.ok ? "OK" : "GAGAL", PESAN: safe.message ?? "Tidak ada data", QUERY: q, ...(rows[0] ?? {}) }],
        });
      } catch (e) {
        setResult({
          status: false,
          query: q,
          feature: feature.id,
          timestamp: new Date().toISOString(),
          data: [{ STATUS: "ERROR", PESAN: (e as Error).message, QUERY: q }],
        });
      } finally {
        setLoading(false);
      }
      return;
    }

    if (feature.id === "nik" || feature.id === "kk" || feature.id === "nama") {
      const kind = feature.id as "nik" | "kk" | "nama";
      try {
        const res = await lookup({ data: { kind, query: q } });
        const safe = res ?? { ok: false, message: "Tidak ada respons dari server", rows: [] };
        const rows = Array.isArray(safe.rows) ? safe.rows : [];
        setResult({
          status: !!safe.ok,
          query: q,
          feature: feature.id,
          timestamp: new Date().toISOString(),
          data: safe.ok
            ? rows
            : [{ STATUS: "GAGAL", PESAN: safe.message ?? "Tidak ada data", QUERY: q }],
        });
      } catch (e) {
        setResult({
          status: false,
          query: q,
          feature: feature.id,
          timestamp: new Date().toISOString(),
          data: [{ STATUS: "ERROR", PESAN: (e as Error).message, QUERY: q }],
        });
      } finally {
        setLoading(false);
      }
      return;
    }

    setTimeout(() => {
      setResult(generateMockResult(feature.id, q));
      setLoading(false);
    }, 850);
  };

  if (!ready || !user) return null;

  const stats = [
    { label: "Modul Aktif", value: visibleFeatures.length, accent: "text-cyber" },
    { label: "Kategori", value: categories.length, accent: "text-success" },
    { label: "Sumber Data", value: "12", accent: "text-cyber" },
    { label: "Uptime", value: "99.98%", accent: "text-success" },
  ];



  return (
    <div className="min-h-screen flex w-full">
      <Sidebar categories={categories} activeCategory={activeCategory} onSelectCategory={setActiveCategory} />

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
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-border bg-panel/50 text-xs font-mono">
                <span className="text-muted-foreground">OPERATOR:</span>
                <span className="text-cyber tracking-wider">{user.username.toUpperCase()}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-cyber/15 text-cyber">{user.label}</span>
                {settings.telegramEnabled && (
                  <span title="Telegram aktif" className="text-success flex items-center gap-1"><Send className="w-3 h-3" /> TG</span>
                )}
              </div>
              {user.role === "admin" && (
                <Link to="/admin" className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-cyber/40 text-cyber text-xs font-mono tracking-wider hover:bg-cyber/10 transition-colors">
                  <ShieldCheck className="w-3.5 h-3.5" /> ADMIN
                </Link>
              )}
              <button className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-sm border border-border text-muted-foreground text-xs font-mono tracking-wider hover:border-cyber hover:text-cyber transition-colors">
                <Info className="w-3.5 h-3.5" /> PANDUAN
              </button>
              <button
                onClick={() => { logout(); navigate({ to: "/login" }); }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-destructive/40 text-destructive text-xs font-mono tracking-wider hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" /> LOGOUT
              </button>
            </div>
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
                ▸ Modul Intelijen {activeCategory ? `· ${activeCategory}` : ""}
              </h2>
              <span className="text-[10px] font-mono text-muted-foreground">
                {filteredFeatures.length} modul · klik untuk aktifkan
              </span>
            </div>
            <FeatureGrid features={filteredFeatures} active={feature?.id ?? ""} onSelect={setFeature} />
          </section>

          <section className="xl:col-span-5 space-y-4">
            {feature ? (
              <>
                {feature.id === "bpjs" ? (
                  <BpjsConsole feature={feature} onSubmit={handleBpjsSubmit} loading={loading} />
                ) : (
                  <QueryConsole feature={feature} onSubmit={handleSubmit} loading={loading} />
                )}
                <ResultsPanel result={result} loading={loading} />
              </>
            ) : (
              <div className="panel-frame rounded-sm p-6 text-center text-xs font-mono text-muted-foreground">
                Belum ada modul yang tersedia untuk Anda.
              </div>
            )}
          </section>
        </main>

        <footer className="px-6 py-3 border-t border-border text-[10px] font-mono text-muted-foreground flex justify-between">
          <span>Den 404 Anti Eror OSINT v2.4.1 · Authorized personnel only</span>
          <span className="text-cyber">SESSION: {user.username.toUpperCase()}-A7F3-XK</span>
        </footer>
      </div>
    </div>
  );
}
