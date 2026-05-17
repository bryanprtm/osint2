import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Crosshair, Lock, User as UserIcon, Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Login · JCD OSINT" }] }),
});

function LoginPage() {
  const { login, user, ready } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ready && user) navigate({ to: "/" });
  }, [ready, user, navigate]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setTimeout(() => {
      const r = login(username, password);
      setLoading(false);
      if (!r.ok) setError(r.error ?? "Login gagal");
      else navigate({ to: "/" });
    }, 500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-40" />
      <div className="absolute inset-0 scanline pointer-events-none" />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-sm border border-cyber bg-cyber/10 glow-cyber mb-3">
            <Crosshair className="w-8 h-8 text-cyber" />
          </div>
          <h1 className="text-2xl font-bold tracking-wider">
            JCD <span className="text-cyber text-glow">OSINT</span>
          </h1>
          <p className="text-[10px] font-mono tracking-[0.3em] text-muted-foreground mt-1">
            COMMAND CENTER · AUTH REQUIRED
          </p>
        </div>

        <form onSubmit={submit} className="panel-frame corner-brackets rounded-sm p-6 space-y-4">
          <div className="flex items-center gap-2 text-cyber pb-2 border-b border-border">
            <Lock className="w-4 h-4" />
            <span className="text-xs font-mono uppercase tracking-[0.25em]">Secure Access</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Operator ID
            </label>
            <div className="flex items-center gap-2 border border-border bg-input/40 px-3 py-2 rounded-sm focus-within:border-cyber">
              <UserIcon className="w-4 h-4 text-muted-foreground" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin / user"
                autoComplete="username"
                className="flex-1 bg-transparent outline-none font-mono text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Access Key
            </label>
            <div className="flex items-center gap-2 border border-border bg-input/40 px-3 py-2 rounded-sm focus-within:border-cyber">
              <Lock className="w-4 h-4 text-muted-foreground" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="flex-1 bg-transparent outline-none font-mono text-sm"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive border border-destructive/40 bg-destructive/10 px-3 py-2 rounded-sm">
              <ShieldAlert className="w-4 h-4" /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-sm
              bg-cyber text-primary-foreground font-semibold tracking-wider text-sm
              hover:bg-cyber-glow transition-colors disabled:opacity-40 disabled:cursor-not-allowed
              glow-cyber uppercase"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            {loading ? "Verifying..." : "Authenticate"}
          </button>

        </form>

        <p className="text-center text-[10px] font-mono text-muted-foreground mt-4 tracking-wider">
          UNAUTHORIZED ACCESS IS PROHIBITED · v2.4.1
        </p>
      </div>
    </div>
  );
}
