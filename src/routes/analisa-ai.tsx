import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AnalisaAiConsole } from "@/components/analisa/AnalisaAiConsole";
import { useAuth } from "@/lib/auth";
import { ArrowLeft, Brain } from "lucide-react";

export const Route = createFileRoute("/analisa-ai")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Analisa AI Target — Den 404 Anti Eror OSINT" },
      { name: "description", content: "Orkestrasi otomatis rangkaian command bot WhatsApp OSINT dengan pemetaan lokasi dan analisa AI." },
    ],
  }),
  component: AnalisaAiPage,
});

function AnalisaAiPage() {
  const { ready, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !user) navigate({ to: "/login" });
  }, [ready, user, navigate]);

  if (!ready || !user) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="px-6 py-4 border-b border-border flex items-center gap-4">
        <Link to="/" className="flex items-center gap-1.5 text-[11px] font-mono tracking-widest text-muted-foreground hover:text-cyber">
          <ArrowLeft className="w-3.5 h-3.5" /> DASHBOARD
        </Link>
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-cyber" />
          <h1 className="text-lg font-bold tracking-tight">
            Analisa <span className="text-cyber text-glow">AI Target</span>
          </h1>
        </div>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">
          OP: <span className="text-cyber">{user.username.toUpperCase()}</span>
        </span>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        <AnalisaAiConsole />
      </main>
    </div>
  );
}
