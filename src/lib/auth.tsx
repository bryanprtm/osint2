import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { loginCheck, validateSession, logoutSession } from "@/lib/users.functions";
import {
  listModules, upsertModule, patchModule, deleteModule, resetModulesAll,
  getAppSettings, updateAppSettings,
} from "@/lib/modules.functions";
import {
  IdCard, Users, User, HeartPulse, Car, Hash, Binary, Phone,
  Camera, ScanFace, Radio, Satellite, Newspaper, Database,
  Network, Bug, ShieldAlert, Lock, FolderSearch, ShieldCheck, Globe2,
  Activity, Map, Calculator, PackageSearch, FileSearch, Mail, Cpu,
  FileDigit, Search, ScanLine, KeyRound, FileWarning, Link2, ShieldX,
  FileCode, FormInput, Code2, Flame, Swords, KeySquare, Unlock, Dices,
  TerminalSquare, FileJson, ArrowLeftRight, type LucideIcon,
} from "lucide-react";
import { FEATURES, type Feature } from "@/lib/osint-data";

export type Role = "admin" | "operator";
export type AuthUser = { id?: string; username: string; role: Role; label: string };

const AUTH_KEY = "jcd_osint_auth";

export type StoredModule = {
  id: string;
  code: string;
  name: string;
  desc: string;
  input: string;
  placeholder: string;
  category: Feature["category"];
  iconKey: string;
  enabled: boolean;
  custom: boolean;
};

export type AppSettings = {
  telegramBotToken: string;
  telegramChatId: string;
  telegramEnabled: boolean;
  brandTitle: string;
  brandSubtitle: string;
  brandLogoUrl: string;
};

const ICON_MAP: Record<string, LucideIcon> = {
  IdCard, Users, User, HeartPulse, Car, Hash, Binary, Phone,
  Camera, ScanFace, Radio, Satellite, Newspaper, Database,
  Network, Bug, ShieldAlert, Lock, FolderSearch, ShieldCheck, Globe2,
  Activity, Map, Calculator, PackageSearch, FileSearch, Mail, Cpu,
  FileDigit, Search, ScanLine, KeyRound, FileWarning, Link2, ShieldX,
  FileCode, FormInput, Code2, Flame, Swords, KeySquare, Unlock, Dices,
  TerminalSquare, FileJson, ArrowLeftRight,
};

export function iconFor(key: string): LucideIcon {
  return ICON_MAP[key] ?? Database;
}

export const ICON_OPTIONS = Object.keys(ICON_MAP);

function featureToStored(f: Feature, i: number): StoredModule & { sort_order: number } {
  const iconKey = Object.entries(ICON_MAP).find(([, v]) => v === f.icon)?.[0] ?? "Database";
  return {
    id: f.id, code: f.code, name: f.name, desc: f.desc,
    input: f.input, placeholder: f.placeholder, category: f.category,
    iconKey, enabled: true, custom: false, sort_order: i,
  };
}

const DEFAULT_MODULES_FULL = FEATURES.map((f, i) => featureToStored(f, i));
const DEFAULT_MODULES: StoredModule[] = DEFAULT_MODULES_FULL.map(({ sort_order: _s, ...m }) => m);
const DEFAULT_SETTINGS: AppSettings = { telegramBotToken: "", telegramChatId: "", telegramEnabled: false, brandTitle: "Den 404 Anti Eror OSINT", brandSubtitle: "PROFILER //ID", brandLogoUrl: "" };

type AuthCtx = {
  ready: boolean;
  user: AuthUser | null;
  modules: StoredModule[];
  settings: AppSettings;
  login: (u: string, p: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  addModule: (m: Omit<StoredModule, "custom">) => Promise<void>;
  updateModule: (id: string, patch: Partial<StoredModule>) => Promise<void>;
  removeModule: (id: string) => Promise<void>;
  toggleModule: (id: string, enabled: boolean) => Promise<void>;
  resetModules: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  refreshModules: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [modules, setModules] = useState<StoredModule[]>(DEFAULT_MODULES);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const seedingRef = useRef(false);

  const fetchModules = useCallback(async () => {
    try {
      const r = await listModules();
      if (r.modules.length === 0 && !seedingRef.current) {
        // First boot: seed defaults into the shared DB so all users start in sync.
        seedingRef.current = true;
        try {
          await resetModulesAll({ data: { modules: DEFAULT_MODULES_FULL } });
          const r2 = await listModules();
          setModules(r2.modules.map(({ sort_order: _s, ...m }) => m as StoredModule));
        } finally {
          seedingRef.current = false;
        }
      } else {
        setModules(r.modules.map(({ sort_order: _s, ...m }) => m as StoredModule));
      }
    } catch {
      /* keep last known modules on transient failures */
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const r = await getAppSettings();
      setSettings(r.settings);
    } catch {
      /* keep last known settings */
    }
  }, []);

  const tokenRef = useRef<string | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const doLogout = useCallback(async (reason: "manual" | "idle_timeout" | "kicked") => {
    const u = user;
    const t = tokenRef.current;
    setUser(null);
    tokenRef.current = null;
    try { localStorage.removeItem(AUTH_KEY); } catch { /* ignore */ }
    if (u?.id && t && (reason === "manual" || reason === "idle_timeout")) {
      try { await logoutSession({ data: { userId: u.id, token: t, reason } }); } catch { /* ignore */ }
    }
    if (reason === "idle_timeout") {
      try { alert("Sesi berakhir otomatis setelah 10 menit tidak aktif."); } catch { /* ignore */ }
    } else if (reason === "kicked") {
      try { alert("Akun ini login di perangkat lain. Sesi ini diakhiri."); } catch { /* ignore */ }
    }
  }, [user]);

  useEffect(() => {
    try {
      const a = localStorage.getItem(AUTH_KEY);
      if (a) {
        const parsed = JSON.parse(a);
        if (parsed?.user && parsed?.token) {
          setUser(parsed.user);
          tokenRef.current = parsed.token;
        }
      }
    } catch {
      /* ignore */
    }
    void Promise.all([fetchModules(), fetchSettings()]).finally(() => setReady(true));
  }, [fetchModules, fetchSettings]);

  // Refetch when tab regains focus so operators see admin changes promptly.
  useEffect(() => {
    const onFocus = () => { void fetchModules(); void fetchSettings(); };
    const onVis = () => { if (document.visibilityState === "visible") onFocus(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    const t = window.setInterval(onFocus, 30_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(t);
    };
  }, [fetchModules, fetchSettings]);

  // Idle auto-logout (10 min) + single-device session validation (every 20s)
  useEffect(() => {
    if (!user) return;
    const IDLE_MS = 10 * 60 * 1000;
    const bump = () => { lastActivityRef.current = Date.now(); };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    const idleTimer = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= IDLE_MS) {
        void doLogout("idle_timeout");
      }
    }, 15_000);

    const sessionTimer = window.setInterval(async () => {
      const t = tokenRef.current;
      if (!user?.id || !t) return;
      try {
        const r = await validateSession({ data: { userId: user.id, token: t } });
        if (!r.ok) void doLogout("kicked");
      } catch {
        /* transient */
      }
    }, 20_000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(idleTimer);
      window.clearInterval(sessionTimer);
    };
  }, [user, doLogout]);

  const value: AuthCtx = {
    ready,
    user,
    modules,
    settings,
    login: async (u, p) => {
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : undefined;
      const r = await loginCheck({ data: { username: u, password: p, userAgent: ua } });
      if (!r.ok) return { ok: false, error: r.error };
      setUser(r.user);
      tokenRef.current = r.token;
      lastActivityRef.current = Date.now();
      localStorage.setItem(AUTH_KEY, JSON.stringify({ user: r.user, token: r.token }));
      return { ok: true };
    },
    logout: () => { void doLogout("manual"); },
    addModule: async (m) => {
      if (modules.some((x) => x.id === m.id)) return;
      const sort_order = modules.length;
      await upsertModule({ data: { ...m, custom: true, sort_order } });
      await fetchModules();
    },
    updateModule: async (id, patch) => {
      await patchModule({ data: { id, ...patch } });
      await fetchModules();
    },
    removeModule: async (id) => {
      await deleteModule({ data: { id } });
      await fetchModules();
    },
    toggleModule: async (id, enabled) => {
      await patchModule({ data: { id, enabled } });
      setModules((prev) => prev.map((m) => (m.id === id ? { ...m, enabled } : m)));
    },
    resetModules: async () => {
      await resetModulesAll({ data: { modules: DEFAULT_MODULES_FULL } });
      await fetchModules();
    },
    updateSettings: async (patch) => {
      await updateAppSettings({ data: patch });
      await fetchSettings();
    },
    refreshModules: fetchModules,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}

export function storedToFeature(m: StoredModule): Feature {
  return {
    id: m.id, code: m.code, name: m.name, desc: m.desc,
    input: m.input, placeholder: m.placeholder, category: m.category,
    icon: iconFor(m.iconKey),
  };
}

