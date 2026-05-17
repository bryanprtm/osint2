import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth, ICON_OPTIONS, iconFor, type StoredModule } from "@/lib/auth";
import { Sidebar } from "@/components/osint/Sidebar";
import { StatusBar } from "@/components/osint/StatusBar";
import {
  Plus, Trash2, Pencil, Eye, EyeOff, Send, Save, ArrowLeft, RotateCcw, ShieldCheck, Check, X,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "Admin · Den 404 Anti Eror" }] }),
});

const DEFAULT_CATEGORIES = [
  "Identitas", "Kendaraan", "Telekomunikasi", "Biometrik", "Geo & Sinyal", "Analitik",
  "Cybersecurity", "Jaringan", "Web Exploit", "Password & Kripto", "Utilitas",
];

const EMPTY: Omit<StoredModule, "custom"> = {
  id: "", code: "", name: "", desc: "", input: "", placeholder: "",
  category: "Identitas", iconKey: "Database", enabled: true,
};

function AdminPage() {
  const { ready, user, modules, settings, addModule, updateModule, removeModule, toggleModule, resetModules, updateSettings, logout } = useAuth();
  const navigate = useNavigate();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<StoredModule, "custom">>(EMPTY);
  const [showForm, setShowForm] = useState(false);

  const categoryOptions = Array.from(new Set([...DEFAULT_CATEGORIES, ...modules.map((m) => m.category).filter(Boolean)])).sort();

  const [tgToken, setTgToken] = useState(settings.telegramBotToken);
  const [tgChat, setTgChat] = useState(settings.telegramChatId);
  const [tgEnabled, setTgEnabled] = useState(settings.telegramEnabled);
  const [savedNote, setSavedNote] = useState("");

  useEffect(() => {
    if (!ready) return;
    if (!user) navigate({ to: "/login" });
    else if (user.role !== "admin") navigate({ to: "/" });
  }, [ready, user, navigate]);

  useEffect(() => {
    setTgToken(settings.telegramBotToken);
    setTgChat(settings.telegramChatId);
    setTgEnabled(settings.telegramEnabled);
  }, [settings]);

  if (!ready || !user || user.role !== "admin") return null;

  const startEdit = (m: StoredModule) => {
    setEditingId(m.id);
    setDraft({
      id: m.id, code: m.code, name: m.name, desc: m.desc,
      input: m.input, placeholder: m.placeholder,
      category: m.category, iconKey: m.iconKey, enabled: m.enabled,
    });
    setShowForm(true);
  };

  const startNew = () => {
    setEditingId(null);
    setDraft({ ...EMPTY, id: `cust-${Date.now().toString(36)}`, code: `OSI-${(modules.length + 1).toString().padStart(3, "0")}` });
    setShowForm(true);
  };

  const cancel = () => { setShowForm(false); setEditingId(null); };

  const save = () => {
    if (!draft.id.trim() || !draft.name.trim()) return;
    if (editingId) {
      updateModule(editingId, draft);
    } else {
      addModule(draft);
    }
    cancel();
  };

  const saveTelegram = () => {
    updateSettings({ telegramBotToken: tgToken.trim(), telegramChatId: tgChat.trim(), telegramEnabled: tgEnabled });
    setSavedNote("Konfigurasi Telegram tersimpan.");
    setTimeout(() => setSavedNote(""), 2500);
  };

  return (
    <div className="min-h-screen flex w-full">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <StatusBar />

        <header className="px-6 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-cyber text-xs font-mono tracking-[0.3em] mb-1">
              <ShieldCheck className="w-3.5 h-3.5" /> ADMIN CONSOLE
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Manajemen <span className="text-cyber text-glow">Modul</span> & Integrasi
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-border text-xs font-mono tracking-wider hover:border-cyber hover:text-cyber transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> KEMBALI
            </Link>
            <button
              onClick={() => { logout(); navigate({ to: "/login" }); }}
              className="px-3 py-1.5 rounded-sm border border-destructive/40 text-destructive text-xs font-mono tracking-wider hover:bg-destructive/10"
            >
              LOGOUT
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Modules */}
          <section className="xl:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-mono uppercase tracking-[0.3em] text-cyber">▸ Daftar Modul ({modules.length})</h2>
              <div className="flex gap-2">
                <button onClick={resetModules} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border border-border text-[10px] font-mono hover:border-cyber hover:text-cyber">
                  <RotateCcw className="w-3 h-3" /> RESET
                </button>
                <button onClick={startNew} className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-cyber text-primary-foreground text-[11px] font-semibold tracking-wider hover:bg-cyber-glow glow-cyber">
                  <Plus className="w-3.5 h-3.5" /> TAMBAH MODUL
                </button>
              </div>
            </div>

            {showForm && (
              <div className="panel-frame rounded-sm p-4 space-y-3 border-cyber/50">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-mono uppercase tracking-[0.25em] text-cyber">
                    {editingId ? "Edit Modul" : "Modul Baru"}
                  </div>
                  <button onClick={cancel} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="ID" value={draft.id} onChange={(v) => setDraft({ ...draft, id: v })} disabled={!!editingId} />
                  <Field label="Kode" value={draft.code} onChange={(v) => setDraft({ ...draft, code: v })} />
                  <Field label="Nama Modul" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} full />
                  <Field label="Deskripsi" value={draft.desc} onChange={(v) => setDraft({ ...draft, desc: v })} full />
                  <Field label="Label Input" value={draft.input} onChange={(v) => setDraft({ ...draft, input: v })} />
                  <Field label="Placeholder" value={draft.placeholder} onChange={(v) => setDraft({ ...draft, placeholder: v })} />
                  <ComboField label="Kategori" value={draft.category} options={categoryOptions} onChange={(v) => setDraft({ ...draft, category: v })} placeholder="Pilih atau ketik kategori baru..." />
                  <SelectField label="Ikon" value={draft.iconKey} options={ICON_OPTIONS} onChange={(v) => setDraft({ ...draft, iconKey: v })} />
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
                    <span className="font-mono tracking-wider text-muted-foreground">TAMPILKAN KE OPERATOR</span>
                  </label>
                  <button onClick={save} className="flex items-center gap-2 px-4 py-1.5 bg-cyber text-primary-foreground text-xs font-semibold rounded-sm glow-cyber hover:bg-cyber-glow">
                    <Save className="w-3.5 h-3.5" /> SIMPAN
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              {modules.map((m) => {
                const Icon = iconFor(m.iconKey);
                return (
                  <div key={m.id} className={`panel-frame rounded-sm p-3 flex items-center gap-3 ${m.enabled ? "" : "opacity-50"}`}>
                    <div className={`p-2 rounded-sm ${m.enabled ? "bg-cyber/15 text-cyber" : "bg-secondary text-muted-foreground"}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-cyber/80">{m.code}</span>
                        <span className="text-sm font-semibold truncate">{m.name}</span>
                        {m.custom && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-success/15 text-success">CUSTOM</span>}
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-secondary text-muted-foreground">{m.category}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{m.desc}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <IconBtn title={m.enabled ? "Sembunyikan" : "Tampilkan"} onClick={() => toggleModule(m.id, !m.enabled)}>
                        {m.enabled ? <Eye className="w-4 h-4 text-cyber" /> : <EyeOff className="w-4 h-4" />}
                      </IconBtn>
                      <IconBtn title="Edit" onClick={() => startEdit(m)}><Pencil className="w-4 h-4" /></IconBtn>
                      <IconBtn title="Hapus" onClick={() => removeModule(m.id)}><Trash2 className="w-4 h-4 text-destructive" /></IconBtn>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Telegram */}
          <section className="space-y-3">
            <h2 className="text-xs font-mono uppercase tracking-[0.3em] text-cyber">▸ Integrasi Telegram</h2>
            <div className="panel-frame corner-brackets rounded-sm p-4 space-y-3">
              <div className="flex items-center gap-2 text-cyber pb-2 border-b border-border">
                <Send className="w-4 h-4" />
                <span className="text-xs font-mono uppercase tracking-[0.25em]">Notifikasi Bot</span>
              </div>

              <Field label="Bot Token" value={tgToken} onChange={setTgToken} placeholder="123456:ABC-DEF..." mono full />
              <Field label="Chat / Channel ID" value={tgChat} onChange={setTgChat} placeholder="-1001234567890" mono full />

              <label className="flex items-center gap-2 text-xs pt-1">
                <input type="checkbox" checked={tgEnabled} onChange={(e) => setTgEnabled(e.target.checked)} />
                <span className="font-mono tracking-wider text-muted-foreground">AKTIFKAN PENGIRIMAN LOG QUERY</span>
              </label>

              <button onClick={saveTelegram} className="w-full flex items-center justify-center gap-2 py-2 rounded-sm bg-cyber text-primary-foreground font-semibold tracking-wider text-xs glow-cyber hover:bg-cyber-glow uppercase">
                <Save className="w-3.5 h-3.5" /> Simpan Konfigurasi
              </button>

              {savedNote && (
                <div className="flex items-center gap-2 text-[11px] text-success border border-success/30 bg-success/10 px-2 py-1.5 rounded-sm">
                  <Check className="w-3.5 h-3.5" /> {savedNote}
                </div>
              )}

              <div className="text-[10px] font-mono text-muted-foreground border-t border-border pt-2 leading-relaxed">
                Buat bot via <span className="text-cyber">@BotFather</span> di Telegram untuk
                mendapatkan token. Konfigurasi disimpan lokal (mockup).
              </div>
            </div>

            <div className="panel-frame rounded-sm p-4 text-[11px] font-mono text-muted-foreground space-y-1">
              <div className="text-cyber text-[10px] tracking-[0.3em]">▸ HAK AKSES</div>
              <div><span className="text-foreground">ADMIN</span> · CRUD modul, kelola Telegram</div>
              <div><span className="text-foreground">OPERATOR</span> · hanya modul yang ditampilkan</div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, full, disabled, placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void;
  full?: boolean; disabled?: boolean; placeholder?: string; mono?: boolean;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={`mt-1 w-full bg-input/40 border border-border focus:border-cyber outline-none px-2.5 py-1.5 rounded-sm text-sm ${mono ? "font-mono" : ""} disabled:opacity-50`}
      />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: {
  label: string; value: string; options: readonly string[]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full bg-input/40 border border-border focus:border-cyber outline-none px-2.5 py-1.5 rounded-sm text-sm"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function ComboField({ label, value, options, onChange, placeholder }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; placeholder?: string;
}) {
  const listId = `cat-list-${label.replace(/\s+/g, "-")}`;
  return (
    <div>
      <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</label>
      <input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full bg-input/40 border border-border focus:border-cyber outline-none px-2.5 py-1.5 rounded-sm text-sm"
      />
      <datalist id={listId}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
      <div className="text-[9px] font-mono text-muted-foreground/70 mt-1">Pilih dari daftar atau ketik kategori baru</div>
    </div>
  );
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button title={title} onClick={onClick} className="p-1.5 rounded-sm hover:bg-panel-elevated transition-colors text-muted-foreground hover:text-foreground">
      {children}
    </button>
  );
}

