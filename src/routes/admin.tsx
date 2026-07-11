import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth, ICON_OPTIONS, iconFor, type StoredModule } from "@/lib/auth";
import { Sidebar } from "@/components/osint/Sidebar";
import { StatusBar } from "@/components/osint/StatusBar";
import {
  Plus, Trash2, Pencil, Eye, EyeOff, Send, Save, ArrowLeft, RotateCcw, ShieldCheck, Check, X,
  UserPlus, Users as UsersIcon, KeyRound, Loader2, MessageCircle, Copy,
} from "lucide-react";
import { listUsers, createUser, updateUser, deleteUser, type AppUserRow } from "@/lib/users.functions";
import { getWaSettings, saveWaSettings, listWaSendLog, getWaWebhookUrl, DEFAULT_WA_COMMANDS, type WaSettingsPublic, type WaSendLogRow, type WaProvider } from "@/lib/wa-gateway.functions";
import { getAiSettings, saveAiSettings, type AiSettingsPublic, type AiProvider } from "@/lib/ai-settings.functions";
import { useServerFn } from "@tanstack/react-start";


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
  const [activeCategory, setActiveCategory] = useState("");

  const categoryOptions = Array.from(new Set([...DEFAULT_CATEGORIES, ...modules.map((m) => m.category).filter(Boolean)])).sort();
  const categories = useMemo(() => Array.from(new Set(modules.map((m) => m.category).filter(Boolean))).sort(), [modules]);

  const groupedModules = useMemo(() => {
    const map = new Map<string, StoredModule[]>();
    for (const m of modules) {
      if (activeCategory && m.category !== activeCategory) continue;
      const key = m.category?.trim() || "Lainnya";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries());
  }, [modules, activeCategory]);

  const [tgToken, setTgToken] = useState(settings.telegramBotToken);
  const [tgChat, setTgChat] = useState(settings.telegramChatId);
  const [tgEnabled, setTgEnabled] = useState(settings.telegramEnabled);
  const [savedNote, setSavedNote] = useState("");

  // --- WhatsApp Gateway state ---
  const [waProvider, setWaProvider] = useState<WaProvider>("fonnte");
  const [waBotNumber, setWaBotNumber] = useState("");
  const [waSubdomain, setWaSubdomain] = useState("");
  const [waEnabled, setWaEnabled] = useState(false);
  const [waCommands, setWaCommands] = useState<Record<string, string>>({ ...DEFAULT_WA_COMMANDS });
  const [waToken, setWaToken] = useState("");
  const [waSecret, setWaSecret] = useState("");
  const [waHasToken, setWaHasToken] = useState(false);
  const [waHasSecret, setWaHasSecret] = useState(false);
  const [waNote, setWaNote] = useState("");
  const [waErr, setWaErr] = useState("");
  const [waBusy, setWaBusy] = useState(false);
  const [waLog, setWaLog] = useState<WaSendLogRow[]>([]);
  const [waWebhookUrl, setWaWebhookUrl] = useState<string | null>(null);
  const [waWebhookCopied, setWaWebhookCopied] = useState(false);
  const fetchWaSettings = useServerFn(getWaSettings);
  const persistWaSettings = useServerFn(saveWaSettings);
  const fetchWaLog = useServerFn(listWaSendLog);
  const fetchWaWebhookUrl = useServerFn(getWaWebhookUrl);

  const applyWaSettings = (s: WaSettingsPublic) => {
    setWaProvider(s.provider);
    setWaBotNumber(s.bot_number);
    setWaSubdomain(s.subdomain ?? "");
    setWaEnabled(s.enabled);
    setWaCommands({ ...DEFAULT_WA_COMMANDS, ...(s.commands ?? {}) });
    setWaHasToken(s.has_token);
    setWaHasSecret(s.has_secret);
  };

  useEffect(() => {
    void fetchWaSettings().then((r) => r?.settings && applyWaSettings(r.settings)).catch(() => {});
    void fetchWaLog({ data: { limit: 20 } }).then((r) => setWaLog(r?.rows ?? [])).catch(() => {});
    void fetchWaWebhookUrl().then((r) => setWaWebhookUrl(r?.url ?? null)).catch(() => {});
  }, [fetchWaSettings, fetchWaLog, fetchWaWebhookUrl]);


  // --- Users state ---
  const [users, setUsers] = useState<AppUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersErr, setUsersErr] = useState("");
  const [userForm, setUserForm] = useState<{
    id: string | null; username: string; password: string; role: "admin" | "operator"; label: string;
  }>({ id: null, username: "", password: "", role: "operator", label: "OPERATOR" });
  const [userBusy, setUserBusy] = useState(false);
  const [userNote, setUserNote] = useState("");

  const refreshUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersErr("");
    try {
      const r = await listUsers();
      setUsers(r.users);
    } catch (e) {
      setUsersErr(e instanceof Error ? e.message : "Gagal memuat pengguna");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => { void refreshUsers(); }, [refreshUsers]);

  const resetUserForm = () =>
    setUserForm({ id: null, username: "", password: "", role: "operator", label: "OPERATOR" });

  const submitUser = async () => {
    setUserBusy(true);
    setUsersErr("");
    setUserNote("");
    try {
      if (userForm.id) {
        const patch: { id: string; password?: string; role?: "admin" | "operator"; label?: string } = {
          id: userForm.id, role: userForm.role, label: userForm.label.trim() || "OPERATOR",
        };
        if (userForm.password.trim()) patch.password = userForm.password;
        const r = await updateUser({ data: patch });
        if (!r.ok) { setUsersErr(r.error); return; }
        setUserNote(`Pengguna "${r.user.username}" diperbarui.`);
      } else {
        const r = await createUser({
          data: {
            username: userForm.username.trim().toLowerCase(),
            password: userForm.password,
            role: userForm.role,
            label: userForm.label.trim() || (userForm.role === "admin" ? "ADMINISTRATOR" : "OPERATOR"),
          },
        });
        if (!r.ok) { setUsersErr(r.error); return; }
        setUserNote(`Pengguna "${r.user.username}" ditambahkan.`);
      }
      resetUserForm();
      await refreshUsers();
      setTimeout(() => setUserNote(""), 2500);
    } catch (e) {
      setUsersErr(e instanceof Error ? e.message : "Operasi gagal");
    } finally {
      setUserBusy(false);
    }
  };

  const editUser = (u: AppUserRow) => {
    setUserForm({ id: u.id, username: u.username, password: "", role: u.role, label: u.label });
  };

  const removeUserAction = async (u: AppUserRow) => {
    if (!confirm(`Hapus pengguna "${u.username}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    setUserBusy(true);
    setUsersErr("");
    try {
      const r = await deleteUser({ data: { id: u.id } });
      if (!r.ok) { setUsersErr(r.error); return; }
      if (userForm.id === u.id) resetUserForm();
      await refreshUsers();
      setUserNote(`Pengguna "${u.username}" dihapus.`);
      setTimeout(() => setUserNote(""), 2500);
    } finally {
      setUserBusy(false);
    }
  };

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

  const saveWhatsapp = async () => {
    setWaBusy(true);
    setWaNote("");
    setWaErr("");
    try {
      const r = await persistWaSettings({
        data: {
          provider: waProvider,
          bot_number: waBotNumber,
          subdomain: waSubdomain,
          enabled: waEnabled,
          commands: waCommands,
          api_token: waToken.trim() || undefined,
          secret_key: waSecret.trim() || undefined,
        },
      });
      if (!r?.ok) {
        setWaErr(r?.error ?? "Gagal menyimpan");
        return;
      }
      applyWaSettings(r.settings);
      setWaToken("");
      setWaSecret("");
      setWaNote("Konfigurasi WhatsApp tersimpan.");
      const l = await fetchWaLog({ data: { limit: 20 } });
      setWaLog(l?.rows ?? []);
      setTimeout(() => setWaNote(""), 2800);
    } catch (e) {
      setWaErr((e as Error).message);
    } finally {
      setWaBusy(false);
    }
  };
  const setWaCommand = (fid: string, val: string) =>
    setWaCommands((c) => ({ ...c, [fid]: val }));



  return (
    <div className="min-h-screen flex w-full">
      <Sidebar categories={categories} activeCategory={activeCategory} onSelectCategory={setActiveCategory} />
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
              <h2 className="text-xs font-mono uppercase tracking-[0.3em] text-cyber">
                ▸ Daftar Modul {activeCategory ? `· ${activeCategory}` : ""} ({activeCategory ? groupedModules[0]?.[1].length ?? 0 : modules.length})
              </h2>
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

            <div className="space-y-4">
              {groupedModules.map(([cat, items]) => (
                <div key={cat} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-cyber/80">▸ {cat}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">[{items.length}]</span>
                    <div className="flex-1 h-px bg-border/60" />
                  </div>
                  <div className="space-y-1.5">
                    {items.map((m) => {
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
                            <IconBtn title="Hapus" onClick={() => { if (confirm(`Hapus modul "${m.name}"? Tindakan ini tidak bisa dibatalkan (gunakan RESET untuk mengembalikan modul bawaan).`)) removeModule(m.id); }}><Trash2 className="w-4 h-4 text-destructive" /></IconBtn>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
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

            {/* === WHATSAPP GATEWAY === */}
            <h2 className="text-xs font-mono uppercase tracking-[0.3em] text-cyber pt-2">▸ Integrasi WhatsApp Gateway</h2>
            <div className="panel-frame corner-brackets rounded-sm p-4 space-y-3">
              <div className="flex items-center gap-2 text-cyber pb-2 border-b border-border">
                <MessageCircle className="w-4 h-4" />
                <span className="text-xs font-mono uppercase tracking-[0.25em]">Gateway API (Fonnte / Wablas)</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Provider</div>
                  <select
                    value={waProvider}
                    onChange={(e) => setWaProvider(e.target.value as WaProvider)}
                    className="w-full bg-input/40 border border-border focus:border-cyber outline-none px-2 py-1.5 rounded-sm text-xs font-mono"
                  >
                    <option value="fonnte">Fonnte (fonnte.com)</option>
                    <option value="wablas">Wablas (wablas.com)</option>
                  </select>
                </div>
                <Field
                  label="Nomor Bot (contoh 628123456789)"
                  value={waBotNumber}
                  onChange={setWaBotNumber}
                  placeholder="628123456789"
                  mono full
                />
              </div>

              {waProvider === "wablas" && (
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Subdomain Wablas <span className="text-muted-foreground">(mis. <span className="text-cyber">jogja</span>, <span className="text-cyber">solo</span>, <span className="text-cyber">pati</span> — bagian sebelum <span className="text-cyber">.wablas.com</span>)</span>
                  </div>
                  <input
                    value={waSubdomain}
                    onChange={(e) => setWaSubdomain(e.target.value)}
                    placeholder="jogja"
                    className="w-full bg-input/40 border border-border focus:border-cyber outline-none px-2 py-1.5 rounded-sm text-xs font-mono lowercase"
                  />
                </div>
              )}

              <div className="space-y-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  API Token {waHasToken && <span className="text-success">● token tersimpan</span>}
                </div>
                <input
                  type="password"
                  value={waToken}
                  onChange={(e) => setWaToken(e.target.value)}
                  placeholder={waHasToken ? "•••••••• (kosongkan untuk tetap pakai token lama)" : "Tempel token API di sini"}
                  className="w-full bg-input/40 border border-border focus:border-cyber outline-none px-2 py-1.5 rounded-sm text-xs font-mono"
                />
              </div>

              {waProvider === "wablas" && (
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Secret Key Wablas {waHasSecret && <span className="text-success">● secret tersimpan</span>}
                    <span className="text-muted-foreground"> — wajib jika device Wablas mengaktifkan proteksi <span className="text-cyber">Secret Key / IP Whitelist</span></span>
                  </div>
                  <input
                    type="password"
                    value={waSecret}
                    onChange={(e) => setWaSecret(e.target.value)}
                    placeholder={waHasSecret ? "•••••••• (kosongkan untuk tetap pakai secret lama)" : "Tempel Secret Key dari dashboard Wablas"}
                    className="w-full bg-input/40 border border-border focus:border-cyber outline-none px-2 py-1.5 rounded-sm text-xs font-mono"
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-xs pt-1">
                <input
                  type="checkbox"
                  checked={waEnabled}
                  onChange={(e) => setWaEnabled(e.target.checked)}
                />
                <span className="font-mono tracking-wider text-muted-foreground">
                  AKTIFKAN TOMBOL "KIRIM KE BOT WHATSAPP" DI MODUL
                </span>
              </label>

              <div className="pt-2 border-t border-border space-y-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Perintah per modul (prefix, contoh: <span className="text-cyber">/nikdetail</span>)
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto pr-1">
                  {modules.filter((m) => m.enabled).map((m) => (
                    <div key={m.id} className="space-y-1">
                      <div className="text-[10px] font-mono text-muted-foreground truncate" title={m.name}>
                        {m.name}
                      </div>
                      <input
                        value={waCommands[m.id] ?? ""}
                        onChange={(e) => setWaCommand(m.id, e.target.value)}
                        placeholder="/perintah"
                        className="w-full bg-input/40 border border-border focus:border-cyber outline-none px-2 py-1 rounded-sm text-xs font-mono"
                      />
                    </div>
                  ))}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground leading-relaxed">
                  Kosongkan perintah untuk menyembunyikan tombol WA pada modul tersebut. Format
                  final yang dikirim ke bot: <span className="text-cyber">/perintah + input user</span> (mis. <span className="text-cyber">/nikdetail3275110203970007</span>).
                </div>
              </div>

              <button onClick={saveWhatsapp} disabled={waBusy} className="w-full flex items-center justify-center gap-2 py-2 rounded-sm bg-cyber text-primary-foreground font-semibold tracking-wider text-xs glow-cyber hover:bg-cyber-glow uppercase disabled:opacity-50">
                <Save className="w-3.5 h-3.5" /> {waBusy ? "Menyimpan..." : "Simpan Konfigurasi WA"}
              </button>

              {waNote && (
                <div className="flex items-center gap-2 text-[11px] text-success border border-success/30 bg-success/10 px-2 py-1.5 rounded-sm">
                  <Check className="w-3.5 h-3.5" /> {waNote}
                </div>
              )}
              {waErr && (
                <div className="flex items-center gap-2 text-[11px] text-destructive border border-destructive/30 bg-destructive/10 px-2 py-1.5 rounded-sm">
                  ⚠ {waErr}
                </div>
              )}

              {waWebhookUrl && (
                <div className="border-t border-border pt-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">URL Webhook (salin ke dashboard Wablas / Fonnte)</span>
                    <button
                      onClick={() => {
                        if (waWebhookUrl) {
                          void navigator.clipboard.writeText(waWebhookUrl);
                          setWaWebhookCopied(true);
                          setTimeout(() => setWaWebhookCopied(false), 2000);
                        }
                      }}
                      className="flex items-center gap-1 text-[10px] font-mono text-cyber hover:underline"
                    >
                      {waWebhookCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {waWebhookCopied ? "Disalin!" : "Salin"}
                    </button>
                  </div>
                  <div className="bg-input/40 border border-border rounded-sm px-2.5 py-2 text-[10px] font-mono text-cyber break-all leading-relaxed">
                    {waWebhookUrl}
                  </div>
                </div>
              )}

              <div className="text-[10px] font-mono text-muted-foreground border-t border-border pt-2 leading-relaxed space-y-0.5">
                <div>1. Daftar di <span className="text-cyber">fonnte.com</span> atau <span className="text-cyber">wablas.com</span>, scan QR sekali di dashboard provider untuk menautkan nomor bot.</div>
                <div>2. Salin API token dari dashboard provider ke form di atas, isi nomor bot & simpan.</div>
                <div>3. User klik <span className="text-success">Kirim ke Bot WhatsApp</span> pada modul → chat otomatis terkirim ke bot dan balasan diterima di WhatsApp user/operator.</div>
              </div>

              {/* Send log */}
              {waLog.length > 0 && (
                <div className="pt-3 mt-2 border-t border-border space-y-1.5">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Log Pengiriman Terakhir</div>
                  <div className="max-h-48 overflow-auto space-y-1">
                    {waLog.map((l) => (
                      <div key={l.id} className="text-[10px] font-mono flex items-center gap-2 border border-border/60 rounded-sm px-2 py-1">
                        <span className={l.status === "sent" ? "text-success" : "text-destructive"}>●</span>
                        <span className="text-muted-foreground shrink-0">{new Date(l.created_at).toLocaleTimeString()}</span>
                        <span className="text-cyber shrink-0">{l.username ?? "-"}</span>
                        <span className="truncate flex-1" title={l.command_sent}>{l.command_sent}</span>
                        <span className="text-muted-foreground shrink-0">{l.provider}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* === USERS MANAGEMENT === */}

            <h2 className="text-xs font-mono uppercase tracking-[0.3em] text-cyber pt-2">▸ Manajemen Pengguna</h2>
            <div className="panel-frame corner-brackets rounded-sm p-4 space-y-3">
              <div className="flex items-center gap-2 text-cyber pb-2 border-b border-border">
                <UsersIcon className="w-4 h-4" />
                <span className="text-xs font-mono uppercase tracking-[0.25em]">
                  Akun ({users.length})
                </span>
                {usersLoading && <Loader2 className="w-3.5 h-3.5 animate-spin ml-auto" />}
              </div>

              {/* Form */}
              <div className="space-y-2 pb-2 border-b border-border">
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {userForm.id ? <><Pencil className="w-3 h-3" /> EDIT PENGGUNA</> : <><UserPlus className="w-3 h-3" /> TAMBAH PENGGUNA</>}
                  {userForm.id && (
                    <button onClick={resetUserForm} className="ml-auto text-muted-foreground hover:text-foreground" title="Batal edit">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <Field
                  label="Username"
                  value={userForm.username}
                  onChange={(v) => setUserForm({ ...userForm, username: v })}
                  placeholder="contoh: operator2"
                  mono
                  full
                  disabled={!!userForm.id}
                />
                <Field
                  label={userForm.id ? "Password (kosongkan jika tidak diubah)" : "Password"}
                  value={userForm.password}
                  onChange={(v) => setUserForm({ ...userForm, password: v })}
                  placeholder="••••••••"
                  mono
                  full
                />
                <div className="grid grid-cols-2 gap-2">
                  <SelectField
                    label="Peran"
                    value={userForm.role}
                    options={["operator", "admin"]}
                    onChange={(v) => setUserForm({
                      ...userForm,
                      role: v as "admin" | "operator",
                      label: !userForm.label || userForm.label === "OPERATOR" || userForm.label === "ADMINISTRATOR"
                        ? (v === "admin" ? "ADMINISTRATOR" : "OPERATOR")
                        : userForm.label,
                    })}
                  />
                  <Field
                    label="Label"
                    value={userForm.label}
                    onChange={(v) => setUserForm({ ...userForm, label: v })}
                    placeholder="OPERATOR"
                  />
                </div>
                <button
                  onClick={submitUser}
                  disabled={userBusy || (!userForm.id && (!userForm.username.trim() || !userForm.password.trim())) || (!!userForm.id && userBusy)}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-sm bg-cyber text-primary-foreground font-semibold tracking-wider text-xs glow-cyber hover:bg-cyber-glow uppercase disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {userBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : userForm.id ? <Save className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                  {userForm.id ? "Simpan Perubahan" : "Tambah Pengguna"}
                </button>

                {usersErr && (
                  <div className="flex items-center gap-2 text-[11px] text-destructive border border-destructive/30 bg-destructive/10 px-2 py-1.5 rounded-sm">
                    <X className="w-3.5 h-3.5" /> {usersErr}
                  </div>
                )}
                {userNote && (
                  <div className="flex items-center gap-2 text-[11px] text-success border border-success/30 bg-success/10 px-2 py-1.5 rounded-sm">
                    <Check className="w-3.5 h-3.5" /> {userNote}
                  </div>
                )}
              </div>

              {/* List */}
              <div className="space-y-1.5 max-h-72 overflow-auto">
                {users.length === 0 && !usersLoading && (
                  <div className="text-[11px] font-mono text-muted-foreground text-center py-3">
                    Belum ada pengguna.
                  </div>
                )}
                {users.map((u) => (
                  <div key={u.id} className={`flex items-center gap-2 px-2.5 py-2 rounded-sm border border-border/60 bg-input/20 ${userForm.id === u.id ? "border-cyber/60" : ""}`}>
                    <div className={`p-1.5 rounded-sm ${u.role === "admin" ? "bg-cyber/15 text-cyber" : "bg-secondary text-muted-foreground"}`}>
                      {u.role === "admin" ? <ShieldCheck className="w-3.5 h-3.5" /> : <UsersIcon className="w-3.5 h-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-mono truncate">
                        {u.username}
                        {user?.username === u.username && (
                          <span className="ml-1.5 text-[9px] font-mono px-1 py-0.5 rounded-sm bg-success/15 text-success">YOU</span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground truncate">
                        {u.role.toUpperCase()} · {u.label}
                      </div>
                    </div>
                    <IconBtn title="Edit / reset password" onClick={() => editUser(u)}>
                      <KeyRound className="w-4 h-4" />
                    </IconBtn>
                    <IconBtn title="Hapus" onClick={() => removeUserAction(u)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </IconBtn>
                  </div>
                ))}
              </div>

              <div className="text-[10px] font-mono text-muted-foreground border-t border-border pt-2 leading-relaxed">
                Akun login disimpan di Lovable Cloud. Password tidak pernah dikirim ke browser; perubahan hanya bisa lewat panel ini.
              </div>
            </div>

            <div className="panel-frame rounded-sm p-4 text-[11px] font-mono text-muted-foreground space-y-1">
              <div className="text-cyber text-[10px] tracking-[0.3em]">▸ HAK AKSES</div>
              <div><span className="text-foreground">ADMIN</span> · CRUD modul, Telegram, kelola pengguna</div>
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

