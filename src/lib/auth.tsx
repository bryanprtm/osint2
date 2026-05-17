import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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
export type AuthUser = { username: string; role: Role; label: string };

const CREDENTIALS: Record<string, { password: string; user: AuthUser }> = {
  admin: { password: "admin", user: { username: "admin", role: "admin", label: "ADMINISTRATOR" } },
  user:  { password: "user123", user: { username: "user", role: "operator", label: "OPERATOR" } },
};

const AUTH_KEY = "jcd_osint_auth";
const MODULES_KEY = "jcd_osint_modules";
const SETTINGS_KEY = "jcd_osint_settings";

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

function featureToStored(f: Feature): StoredModule {
  const iconKey = Object.entries(ICON_MAP).find(([, v]) => v === f.icon)?.[0] ?? "Database";
  return {
    id: f.id, code: f.code, name: f.name, desc: f.desc,
    input: f.input, placeholder: f.placeholder, category: f.category,
    iconKey, enabled: true, custom: false,
  };
}

const DEFAULT_MODULES: StoredModule[] = FEATURES.map(featureToStored);
const DEFAULT_SETTINGS: AppSettings = { telegramBotToken: "", telegramChatId: "", telegramEnabled: false };

type AuthCtx = {
  ready: boolean;
  user: AuthUser | null;
  modules: StoredModule[];
  settings: AppSettings;
  login: (u: string, p: string) => { ok: boolean; error?: string };
  logout: () => void;
  addModule: (m: Omit<StoredModule, "custom">) => void;
  updateModule: (id: string, patch: Partial<StoredModule>) => void;
  removeModule: (id: string) => void;
  toggleModule: (id: string, enabled: boolean) => void;
  resetModules: () => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [modules, setModules] = useState<StoredModule[]>(DEFAULT_MODULES);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    try {
      const a = localStorage.getItem(AUTH_KEY);
      if (a) setUser(JSON.parse(a));
      const m = localStorage.getItem(MODULES_KEY);
      if (m) {
        const stored: StoredModule[] = JSON.parse(m);
        // Merge: keep stored prefs, append any new default modules not yet present
        const ids = new Set(stored.map((x) => x.id));
        const merged = [...stored, ...DEFAULT_MODULES.filter((d) => !ids.has(d.id))];
        setModules(merged);
        if (merged.length !== stored.length) {
          localStorage.setItem(MODULES_KEY, JSON.stringify(merged));
        }
      }
      const s = localStorage.getItem(SETTINGS_KEY);
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s) });
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const persistModules = (next: StoredModule[]) => {
    setModules(next);
    localStorage.setItem(MODULES_KEY, JSON.stringify(next));
  };

  const persistSettings = (next: AppSettings) => {
    setSettings(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  };

  const value: AuthCtx = {
    ready,
    user,
    modules,
    settings,
    login: (u, p) => {
      const rec = CREDENTIALS[u.trim().toLowerCase()];
      if (!rec || rec.password !== p) return { ok: false, error: "Username atau password salah." };
      setUser(rec.user);
      localStorage.setItem(AUTH_KEY, JSON.stringify(rec.user));
      return { ok: true };
    },
    logout: () => {
      setUser(null);
      localStorage.removeItem(AUTH_KEY);
    },
    addModule: (m) => {
      if (modules.some((x) => x.id === m.id)) return;
      persistModules([...modules, { ...m, custom: true }]);
    },
    updateModule: (id, patch) => {
      persistModules(modules.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    },
    removeModule: (id) => {
      const target = modules.find((m) => m.id === id);
      if (!target) return;
      if (target.custom) persistModules(modules.filter((m) => m.id !== id));
      else persistModules(modules.map((m) => (m.id === id ? { ...m, enabled: false } : m)));
    },
    toggleModule: (id, enabled) => {
      persistModules(modules.map((m) => (m.id === id ? { ...m, enabled } : m)));
    },
    resetModules: () => persistModules(DEFAULT_MODULES),
    updateSettings: (patch) => persistSettings({ ...settings, ...patch }),
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
