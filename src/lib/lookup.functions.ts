import { createServerFn } from "@tanstack/react-start";
import { createDecipheriv } from "node:crypto";

type Kind = "nik" | "kk" | "nama";

type ApiRow = {
  nik: string;
  nama: string;
  kk: string;
  alamat: string;
  rt: string;
  kelurahan: string;
  kecamatan: string;
  kota: string;
  provinsi: string;
  jenis_kelamin: string;
  ttl: string;
  pekerjaan: string;
  status_kawin: string;
  status: string;
  ektp: string;
  golongan_darah: string;
};

type ApiResponse =
  | { status: true; kk: string; total_anggota: number; data: ApiRow[] }
  | { status: false; message: string };

const ENDPOINT = "http://46.247.108.15:3025/api/nik2kk";
const IMEI_ENDPOINT = "http://46.247.108.15:3011/cekimei";
const NOPOL_ENDPOINT = "http://46.247.108.15:3008/api/nopol";
const MAHASISWA_ENDPOINT = "https://api.ryzumi.net/api/search/mahasiswa";
const GURU_ENDPOINT = "http://46.247.108.15:1991/cari";
// Cloudflare Workers (runtime Lovable Cloud) memblokir fetch langsung ke IP publik
// dengan error code 1003. Karena penyedia API belum punya domain, kita rutekan
// request melalui Jina Reader sebagai HTTP proxy (gratis, tanpa API key).
const PROXY = "https://r.jina.ai/";

function extractJsonPayload(raw: string): string {
  const text = raw.trim();
  if (!text) return "";

  // Try to unwrap Jina Reader JSON wrapper first: { code, status, data: { text: "..." } }
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as { data?: { text?: string } };
      const inner = parsed?.data?.text?.trim();
      if (inner) {
        const extractedInner = extractJsonPayload(inner);
        if (extractedInner) return extractedInner;
      }
    } catch {
      // bukan JSON valid, lanjut
    }
    return text;
  }

  if (text.startsWith("[")) {
    return text;
  }


  const markdownMatch = text.match(/Markdown Content:\s*([\s\S]*)$/i);
  if (markdownMatch?.[1]) {
    const cleaned = markdownMatch[1]
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    if (cleaned.startsWith("{") || cleaned.startsWith("[")) {
      return cleaned;
    }
  }

  const objectIndex = text.indexOf("{");
  const arrayIndex = text.indexOf("[");
  const firstJsonIndex =
    objectIndex === -1
      ? arrayIndex
      : arrayIndex === -1
        ? objectIndex
        : Math.min(objectIndex, arrayIndex);
  if (firstJsonIndex >= 0) {
    const candidate = text.slice(firstJsonIndex).trim();
    if (candidate.startsWith("{") || candidate.startsWith("[")) {
      return candidate;
    }
  }

  return "";
}

function isRateLimitedText(text: string): boolean {
  const head = text.slice(0, 600).toLowerCase();
  return (
    /rate limit exceeded/i.test(head) ||
    /per ip rate limit/i.test(head) ||
    /too many requests/i.test(head) ||
    /server-side requests are not allowed/i.test(head) ||
    /corsproxy\.io\/pricing/i.test(head) ||
    /quota.*exceeded/i.test(head) ||
    (/429/.test(head) && /limit/i.test(head))
  );
}

function isBlockedProxyText(text: string): boolean {
  const head = text.slice(0, 600).toLowerCase();
  return (
    /^forbidden\b/i.test(head) ||
    /\b403\b/.test(head) ||
    /access denied/i.test(head) ||
    /request (has been )?blocked/i.test(head) ||
    /you don't have permission/i.test(head) ||
    /security policy/i.test(head) ||
    /bad request, valid format is/i.test(head) ||
    /codetabs\.com/i.test(head) && /bad request|valid format/i.test(head) ||
    /cloudflare/i.test(head) && /forbidden|blocked|denied/i.test(head)
  );
}


function normalizeLookupErrorMessage(message: string): string {
  const text = (message || "").trim();
  if (!text) {
    return "Jalur koneksi ke server sumber sedang tidak stabil, silakan coba lagi";
  }

  const head = text.slice(0, 600).toLowerCase();
  if (
    isRateLimitedText(head) ||
    /server-side requests are not allowed/i.test(head) ||
    /upgrade at https?:\/\/corsproxy\.io\/pricing/i.test(head) ||
    /corsproxy\.io/i.test(head)
  ) {
    return "Jalur koneksi publik sedang dibatasi, silakan coba lagi beberapa saat lagi";
  }

  if (
    /http 403/i.test(head) ||
    /proxy http 403/i.test(head) ||
    /forbidden/i.test(head) ||
    /access denied/i.test(head) ||
    isBlockedProxyText(head) ||
    /proxy http 52/i.test(head) ||
    /proxy http 408/i.test(head) ||
    /timeout/i.test(head) ||
    /fetch failed/i.test(head) ||
    /error code:?\s*1003/i.test(head) ||
    /econn|network|socket|tls|connection/i.test(head)
  ) {
    return "Jalur koneksi ke server sumber sedang tidak stabil, silakan coba lagi";
  }

  return text;
}

function sanitizeLookupResultMessage(message: unknown, fallback: string): string {
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) return fallback;

  const normalized = normalizeLookupErrorMessage(text);
  return normalized || fallback;
}

function extractEmbeddedLookupError(payload: unknown, depth = 0): string {
  if (payload === null || payload === undefined || depth > 4) return "";

  if (typeof payload === "string") {
    const text = payload.trim();
    if (!text) return "";
    return isBlockedProxyText(text) || isRateLimitedText(text)
      ? normalizeLookupErrorMessage(text)
      : "";
  }

  if (Array.isArray(payload)) {
    for (const item of payload.slice(0, 8)) {
      const found = extractEmbeddedLookupError(item, depth + 1);
      if (found) return found;
    }
    return "";
  }

  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const priorityKeys = ["MESSAGE", "message", "error", "ERROR", "msg", "MSG", "detail", "DETAIL"];
    for (const key of priorityKeys) {
      const found = extractEmbeddedLookupError(record[key], depth + 1);
      if (found) return found;
    }

    const nestedKeys = ["data", "result", "results", "guru", "mahasiswa", "hasil"];
    for (const key of nestedKeys) {
      const found = extractEmbeddedLookupError(record[key], depth + 1);
      if (found) return found;
    }
  }

  return "";
}

function extractEmbeddedLookupErrorFromText(raw: string): string {
  const extracted = extractJsonPayload(raw).trim();
  if (!extracted || (!extracted.startsWith("{") && !extracted.startsWith("["))) {
    return "";
  }

  try {
    return extractEmbeddedLookupError(JSON.parse(extracted));
  } catch {
    return "";
  }
}

function isRetryableStatus(status: number): boolean {
  return [408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526].includes(status);
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildProxyCandidates(url: string): string[] {
  const stripped = url.replace(/^https?:\/\//, "");
  const [base, query = ""] = url.split("?");
  const encodedQuery = query.replace(/&/g, "%26").replace(/=/g, "%3D");

  // corsproxy.io dihapus: memblokir request server-side ("Server-side requests
  // are not allowed on your plan. Upgrade at https://corsproxy.io/pricing/").
  return Array.from(new Set([
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    `${PROXY}${url}`,
    `${PROXY}${base}`,
    `${PROXY}http://${stripped}`,
    query ? `${PROXY}${base}%3F${encodedQuery}` : `${PROXY}${base}`,
    query ? `${PROXY}http://${stripped.split("?")[0]}%3F${encodedQuery}` : `${PROXY}http://${stripped}`,
  ]));
}

async function fetchUpstream(url: string): Promise<string> {
  let lastError = "";
  const rememberError = (message: string) => {
    if (!message) return;
    lastError = message;
  };

  // 1) Coba langsung beberapa kali dulu, karena sebagian endpoint ternyata bisa
  //    diakses tanpa proxy dan ini jalur paling stabil setelah publish.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const direct = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json, text/plain, */*",
          "User-Agent": "Mozilla/5.0 (compatible; OsintLookup/1.0)",
        },
        signal: AbortSignal.timeout(45_000),
      });
      const body = await direct.text();
      const embeddedError = extractEmbeddedLookupErrorFromText(body);

      if (isRateLimitedText(body) || isBlockedProxyText(body) || embeddedError) {
        rememberError(embeddedError || "Rate limit pada server sumber");
        continue;
      }

      const extracted = extractJsonPayload(body);
      if (extracted) return extracted;

      if (isRetryableStatus(direct.status)) {
        rememberError(`HTTP ${direct.status}`);
        continue;
      }

      if (!direct.ok) {
        rememberError(`HTTP ${direct.status}`);
        continue;
      }

      rememberError("Server sumber mengembalikan format tidak dikenal");
    } catch (e) {
      rememberError((e as Error).message || "Koneksi langsung gagal");
    }
  }

  // 2) Fallback via beberapa proxy publik. Dijalankan 2 putaran dengan urutan
  //    acak agar tidak mentok di proxy yang sedang 522/timeout.
  for (let round = 0; round < 2; round++) {
    for (const proxyUrl of shuffle(buildProxyCandidates(url))) {
      try {
        const res = await fetch(proxyUrl, {
          method: "GET",
          headers: {
            Accept: "application/json, text/plain, */*",
            "X-Return-Format": "text",
            "User-Agent": "Mozilla/5.0 (compatible; OsintLookup/1.0)",
          },
          signal: AbortSignal.timeout(45_000),
        });
        let body = await res.text();

        // Unwrap allorigins /get?url= wrapper
        if (proxyUrl.includes("allorigins.win/get")) {
          try {
            const j = JSON.parse(body) as { contents?: string };
            if (typeof j.contents === "string") body = j.contents;
          } catch {
            // biarkan
          }
        }

        const embeddedError = extractEmbeddedLookupErrorFromText(body);

        if (isRateLimitedText(body) || isBlockedProxyText(body) || embeddedError) {
          rememberError(embeddedError || "Rate limit pada proxy");
          continue;
        }

        const extracted = extractJsonPayload(body);
        if (extracted) return extracted;

        if (isRetryableStatus(res.status) || res.status === 403) {
          rememberError(`Proxy HTTP ${res.status}`);
          continue;
        }

        if (!res.ok && res.status !== 200) {
          rememberError(`Proxy HTTP ${res.status}`);
          continue;
        }

        rememberError("Proxy mengembalikan format tidak dikenal");
      } catch (e) {
        rememberError((e as Error).message || "Proxy error");
      }
    }
  }

  throw new Error(normalizeLookupErrorMessage(lastError || "Semua jalur koneksi gagal mengambil data"));
}

function mapRow(r: ApiRow): Record<string, string> {
  return {
    NIK: r.nik,
    NAMA: r.nama,
    NO_KK: r.kk,
    JENIS_KELAMIN: r.jenis_kelamin,
    TEMPAT_TANGGAL_LAHIR: r.ttl,
    ALAMAT: r.alamat,
    RT_RW: r.rt,
    KELURAHAN: r.kelurahan,
    KECAMATAN: r.kecamatan,
    KOTA: r.kota,
    PROVINSI: r.provinsi,
    PEKERJAAN: r.pekerjaan,
    STATUS_KAWIN: r.status_kawin,
    STATUS: r.status,
    EKTP: r.ektp,
    GOLONGAN_DARAH: r.golongan_darah,
  };
}

export const lookupNik2KK = createServerFn({ method: "POST" })
  .inputValidator((input: { kind: Kind; query: string }) => {
    if (!input || typeof input.query !== "string" || !input.query.trim()) {
      throw new Error("Query wajib diisi");
    }
    if (!["nik", "kk", "nama"].includes(input.kind)) {
      throw new Error("Kind tidak valid");
    }
    return { kind: input.kind as Kind, query: input.query.trim() };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; message: string; kk?: string; rows: Record<string, string>[] }> => {
    const { kind, query } = data;

    // API only accepts NIK or KK number in the `nik` param.
    if (kind === "nama") {
      return {
        ok: false,
        message:
          "Endpoint sumber hanya mendukung pencarian via NIK atau No. KK. Silakan gunakan modul CEK NIK / CEK KK.",
        rows: [],
      };
    }

    const url = `${ENDPOINT}?nik=${encodeURIComponent(query)}`;
    let json: ApiResponse;
    try {
      const trimmed = (await fetchUpstream(url)).trim();
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        return {
          ok: false,
          message: "Server data tidak mengembalikan JSON yang valid.",
          rows: [],
        };
      }
      json = JSON.parse(trimmed) as ApiResponse;
    } catch (e) {
      const msg = normalizeLookupErrorMessage((e as Error).message || String(e));
      return {
        ok: false,
        message: `Gagal menghubungi server data: ${msg}`,
        rows: [],
      };
    }

    if (!json || !json.status) {
      const msg = sanitizeLookupResultMessage(
        json && "message" in json ? json.message : "",
        "Data tidak ditemukan",
      );
      return { ok: false, message: msg, rows: [] };
    }

    const dataArr = Array.isArray(json.data) ? json.data : [];
    if (dataArr.length === 0) {
      return {
        ok: false,
        message: "Data tidak ditemukan untuk query tersebut.",
        kk: json.kk,
        rows: [],
      };
    }
    const rows = dataArr.map(mapRow);
    // For CEK NIK, prioritize the exact NIK match at the top.
    if (kind === "nik") {
      const exact = rows.filter((r) => r.NIK === query);
      const others = rows.filter((r) => r.NIK !== query);
      return {
        ok: true,
        message: `Ditemukan ${exact.length} record (anggota KK: ${json.total_anggota})`,
        kk: json.kk,
        rows: [...exact, ...others],
      };
    }

    // CEK KK: full family
    return {
      ok: true,
      message: `Kartu Keluarga ${json.kk} — ${json.total_anggota} anggota`,
      kk: json.kk,
      rows,
    };
  });

export const lookupImei = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string }) => {
    if (!input || typeof input.query !== "string" || !input.query.trim()) {
      throw new Error("IMEI wajib diisi");
    }
    return { query: input.query.trim() };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; message: string; rows: Record<string, string>[] }> => {
    const { query } = data;
    const url = `${IMEI_ENDPOINT}?query=${encodeURIComponent(query)}`;

    let json: Record<string, unknown>;
    try {
      const trimmed = (await fetchUpstream(url)).trim();
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        return { ok: false, message: "Server data tidak mengembalikan JSON yang valid.", rows: [] };
      }
      json = JSON.parse(trimmed) as Record<string, unknown>;
    } catch (e) {
      return {
        ok: false,
        message: `Gagal menghubungi server data: ${normalizeLookupErrorMessage((e as Error).message || String(e))}`,
        rows: [],
      };
    }

    if (!json) {
      return { ok: false, message: "Tidak ada respons dari server data.", rows: [] };
    }

    const status = String(json.status ?? "").toLowerCase();
    const isError = status === "error" || status === "false" || json.status === false;

    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(json)) {
      if (v === null || v === undefined) continue;
      row[k.toUpperCase()] = typeof v === "object" ? JSON.stringify(v) : String(v);
    }

    if (isError) {
      const msg = sanitizeLookupResultMessage(
        (json.result as string) || (json.message as string),
        "IMEI tidak valid / data tidak ditemukan.",
      );
      return { ok: false, message: msg, rows: Object.keys(row).length ? [row] : [] };
    }

    return {
      ok: true,
      message: `Data IMEI ${query} ditemukan`,
      rows: [row],
    };
  });

// ─── BPJS SIPP ────────────────────────────────────────────────────────────────
const BPJS_ENDPOINT = "http://46.247.108.15:4040/sipp";
const BPJS_API_KEY = "kalcer1337";
const BPJS_AES_KEY = Buffer.from("BPJSKesehatan201BPJSKesehatan201", "utf8");
const BPJS_AES_IV = Buffer.from("*BpjsKesSipp@_!#", "utf8");

function tryAesDecrypt(value: string): string | null {
  try {
    const buf = Buffer.from(value, "base64");
    if (buf.length === 0 || buf.length % 16 !== 0) return null;
    const d = createDecipheriv("aes-256-cbc", BPJS_AES_KEY, BPJS_AES_IV);
    const out = Buffer.concat([d.update(buf), d.final()]);
    return out.toString("utf8");
  } catch {
    return null;
  }
}

function deepDecrypt(node: unknown): unknown {
  if (typeof node === "string") {
    const dec = tryAesDecrypt(node);
    if (dec === null) return node;
    try {
      return deepDecrypt(JSON.parse(dec));
    } catch {
      return dec;
    }
  }
  if (Array.isArray(node)) return node.map(deepDecrypt);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) out[k] = deepDecrypt(v);
    return out;
  }
  return node;
}

type BpjsRawResponse = {
  status: number;
  contentType: string;
  bytes: Uint8Array;
  text: string;
  setCookie: string | null;
};

async function fetchBpjsOnce(url: string, init?: RequestInit): Promise<BpjsRawResponse | null> {
  try {
    const r = await fetch(url, {
      ...init,
      headers: {
        Accept: "*/*",
        "User-Agent": "Mozilla/5.0 (compatible; OsintLookup/1.0)",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(60_000),
    });
    const buf = new Uint8Array(await r.arrayBuffer());
    return {
      status: r.status,
      contentType: r.headers.get("content-type") || "",
      bytes: buf,
      text: new TextDecoder().decode(buf),
      setCookie: r.headers.get("set-cookie"),
    };
  } catch {
    return null;
  }
}

function unwrapAllOriginsGet(raw: BpjsRawResponse): BpjsRawResponse {
  // allorigins /get?url= membungkus respons asli dalam {contents, status:{content_type,...}}
  try {
    const j = JSON.parse(raw.text) as { contents?: string; status?: { content_type?: string; http_code?: number } };
    if (typeof j.contents === "string") {
      const text = j.contents;
      return {
        status: j.status?.http_code ?? raw.status,
        contentType: j.status?.content_type || "text/plain",
        bytes: new TextEncoder().encode(text),
        text,
        setCookie: raw.setCookie,
      };
    }
  } catch {
    // bukan JSON allorigins → biarkan apa adanya
  }
  return raw;
}

function isUsableBpjsResponse(raw: BpjsRawResponse | null): raw is BpjsRawResponse {
  if (!raw || raw.bytes.length === 0) return false;
  if (raw.status >= 400) return false;

  const head = raw.text.slice(0, 400).toLowerCase();
  if (/error code: ?1003/i.test(head)) return false;
  if (/server-side requests are not allowed on your plan/i.test(head)) return false;
  if (/bad request, valid format/i.test(head)) return false;

  return true;
}

async function fetchBpjsRaw(url: string, init?: RequestInit): Promise<BpjsRawResponse> {
  // 1) direct (di CF Worker bisa berhasil untuk IP publik; mendukung POST)
  const direct = await fetchBpjsOnce(url, init);
  if (isUsableBpjsResponse(direct)) {
    return direct;
  }

  // 2) Fallback proxy yang mendukung GET. Pakai allorigins /get?url=
  //    karena /raw sering 500 untuk endpoint IP+port, dan /get membungkus
  //    respons lengkap (termasuk binary kecil) dalam JSON {contents,...}.
  //    Catatan: allorigins TIDAK meneruskan method POST — jika init.method=POST
  //    dan direct gagal, kita tetap coba sebagai GET dengan body diappend ke
  //    query (BPJS API menerima param via query untuk sebagian besar action).
  const method = (init?.method || "GET").toUpperCase();
  let targetUrl = url;
  if (method !== "GET" && init?.body) {
    const sep = targetUrl.includes("?") ? "&" : "?";
    targetUrl = `${targetUrl}${sep}${String(init.body)}`;
  }
  const proxies = [
    `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
  ];
  for (let i = 0; i < proxies.length; i++) {
    const purl = proxies[i];
    const r = await fetchBpjsOnce(purl, { headers: init?.headers });
    const normalized = r ? (i === 0 ? unwrapAllOriginsGet(r) : r) : null;
    if (isUsableBpjsResponse(normalized)) {
      return normalized;
    }
  }

  // 3) Fallback khusus GET via Jina Reader. Ini penting untuk endpoint captcha,
  //    karena proxy lain sering balas 522 walau target aslinya masih hidup.
  if (method === "GET") {
    const [base, query = ""] = targetUrl.split("?");
    const jinaCandidates = [
      `${PROXY}${targetUrl}`,
      query ? `${PROXY}${base}%3F${query.replace(/&/g, "%26").replace(/=/g, "%3D")}` : `${PROXY}${base}`,
    ];
    for (const purl of jinaCandidates) {
      const r = await fetchBpjsOnce(purl, { headers: init?.headers });
      if (isUsableBpjsResponse(r)) {
        return r;
      }
    }
  }

  throw new Error("Semua jalur koneksi gagal menjangkau server BPJS");
}

function extractBpjsJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;

  const bodyMatch = trimmed.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const candidate = (bodyMatch?.[1] ?? trimmed)
    .replace(/^\s*<pre[^>]*>/i, "")
    .replace(/<\/pre>\s*$/i, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .trim();

  const firstBrace = candidate.indexOf("{");
  const firstBracket = candidate.indexOf("[");
  const start = [firstBrace, firstBracket].filter((n) => n >= 0).sort((a, b) => a - b)[0] ?? -1;
  return start >= 0 ? candidate.slice(start).trim() : trimmed;
}

function detectBase64Mime(base64: string): string {
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  if (base64.startsWith("UklGR")) return "image/webp";
  return "image/png";
}

function normalizeCaptchaDataUri(value: string): string {
  const raw = value.trim();
  const base64 = raw.replace(/^data:[^;]+;base64,/i, "");
  const mime = detectBase64Mime(base64);
  return `data:${mime};base64,${base64}`;
}

export const getBpjsCaptcha = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ ok: boolean; message: string; captcha?: string; sessionId?: string }> => {
    const url = `${BPJS_ENDPOINT}?apikey=${BPJS_API_KEY}&action=captcha`;
    // Generate sendiri PHPSESSID — banyak proxy strip Set-Cookie, jadi kita pre-set
    // dan pakai cookie yang sama saat POST ceknik agar captcha tetap valid.
    const ownSession = Array.from(crypto.getRandomValues(new Uint8Array(13)))
      .map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36])
      .join("");
    try {
      const res = await fetchBpjsRaw(url, {
        headers: { Cookie: `PHPSESSID=${ownSession}` },
      });

      // Coba parse JSON dulu
      const extractedJson = extractBpjsJson(res.text);
      if (extractedJson.startsWith("{")) {
        try {
          const j = JSON.parse(extractedJson) as Record<string, unknown>;
          const captcha =
            (j.captcha as string) ||
            (j.captcha_base64 as string) ||
            (j.captchaBase64 as string) ||
            (j.image as string) ||
            (j.img as string) ||
            (j.data as string) ||
            "";
          const sessionId =
            (j.sessionId as string) ||
            (j.session_id as string) ||
            (j.session as string) ||
            ownSession;
          if (captcha) {
            const dataUri = normalizeCaptchaDataUri(captcha);
            return { ok: true, message: "OK", captcha: dataUri, sessionId };
          }
        } catch {
          // bukan JSON valid, lanjut sebagai image
        }
      }

      // Asumsikan respons biner gambar
      if (res.bytes.length > 0) {
        // Validasi minimal: PNG/JPEG/GIF/WebP magic bytes
        const b = res.bytes;
        const isPng = b[0] === 0x89 && b[1] === 0x50;
        const isJpg = b[0] === 0xff && b[1] === 0xd8;
        const isGif = b[0] === 0x47 && b[1] === 0x49;
        const isWebp = b[0] === 0x52 && b[8] === 0x57;
        const ctImage = res.contentType.startsWith("image/");
        if (!ctImage && !isPng && !isJpg && !isGif && !isWebp) {
          // Server kembalikan teks (mungkin error 1003 / HTML)
          return {
            ok: false,
            message: `Server BPJS tidak mengirim gambar captcha. ${res.text.slice(0, 120)}`.trim(),
          };
        }
        const b64 = Buffer.from(b).toString("base64");
        const mime = ctImage
          ? res.contentType
          : isJpg ? "image/jpeg" : isGif ? "image/gif" : isWebp ? "image/webp" : "image/png";

        // Pakai sessionId yang kita pre-set; jika proxy meneruskan Set-Cookie, ambil itu
        let sessionId = ownSession;
        if (res.setCookie) {
          const m = res.setCookie.match(/(PHPSESSID|JSESSIONID|sessionId)=([^;]+)/i);
          if (m) sessionId = m[2];
        }
        return { ok: true, message: "OK", captcha: `data:${mime};base64,${b64}`, sessionId };
      }

      return { ok: false, message: "Captcha tidak tersedia dari server BPJS." };
    } catch (e) {
      return { ok: false, message: `Gagal menghubungi server BPJS: ${(e as Error).message || String(e)}` };
    }
  });


export const lookupBpjs = createServerFn({ method: "POST" })
  .inputValidator((input: { nik: string; captcha: string; sessionId: string }) => {
    if (!input || typeof input.nik !== "string" || !input.nik.trim()) throw new Error("NIK wajib diisi");
    if (!input.captcha || !input.captcha.trim()) throw new Error("Captcha wajib diisi");
    return {
      nik: input.nik.trim(),
      captcha: input.captcha.trim(),
      sessionId: (input.sessionId ?? "").trim(),
    };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; message: string; rows: Record<string, string>[] }> => {
    const { nik, captcha, sessionId } = data;
    const body = new URLSearchParams({
      apikey: BPJS_API_KEY,
      action: "ceknik",
      nik,
      captcha,
      sessionId,
    }).toString();

    let raw: Awaited<ReturnType<typeof fetchBpjsRaw>>;
    try {
      raw = await fetchBpjsRaw(BPJS_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...(sessionId ? { Cookie: `PHPSESSID=${sessionId}` } : {}),
        },
        body,
      });
    } catch (e) {
      return { ok: false, message: `Gagal menghubungi server BPJS: ${(e as Error).message || String(e)}`, rows: [] };
    }

    const text = raw.text.trim();
    let parsed: unknown;
    const extracted = extractBpjsJson(text);
    try {
      parsed = JSON.parse(extracted);
    } catch {
      // Mungkin seluruh response adalah ciphertext base64
      const dec = tryAesDecrypt(extracted || text);
      if (dec) {
        try { parsed = JSON.parse(dec); } catch { parsed = { result: dec }; }
      } else {
        const snippet = (extracted || text).slice(0, 200).replace(/\s+/g, " ");
        return {
          ok: false,
          message: `Server BPJS tidak mengembalikan JSON yang valid. Respons: ${snippet}`,
          rows: [],
        };
      }
    }

    const decrypted = deepDecrypt(parsed) as Record<string, unknown> | unknown[];

    // Normalisasi
    const obj = (Array.isArray(decrypted) ? { data: decrypted } : decrypted) as Record<string, unknown>;
    const status = obj.status;
    const isError =
      status === false ||
      String(status).toLowerCase() === "false" ||
      String(status).toLowerCase() === "error" ||
      obj.error === true;

    const dataField = obj.data ?? obj.result ?? obj;
    const rowsArr: Record<string, unknown>[] = Array.isArray(dataField)
      ? (dataField as Record<string, unknown>[])
      : [dataField as Record<string, unknown>];

    const rows = rowsArr.map((r) => {
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(r ?? {})) {
        if (v === null || v === undefined) continue;
        flat[k.toUpperCase()] = typeof v === "object" ? JSON.stringify(v) : String(v);
      }
      return flat;
    });

    if (isError) {
      const rawMsg = ((obj.message as string) || (obj.result as string) || "").trim();
      const lower = rawMsg.toLowerCase();
      const isCaptcha =
        /captcha|capcha|kode\s*verifikasi|verification\s*code|salah.*captcha|captcha.*salah|invalid.*captcha|wrong.*captcha/.test(
          lower,
        );
      const isNotFound =
        /tidak\s*ditemukan|tidak\s*ada|not\s*found|no\s*data|kosong|belum\s*terdaftar|tidak\s*terdaftar/.test(
          lower,
        );

      let msg: string;
      if (isCaptcha) {
        msg = `❌ Captcha salah. Silakan muat captcha baru dan coba lagi.${rawMsg ? ` (${rawMsg})` : ""}`;
      } else if (isNotFound) {
        msg = `ℹ️ Data BPJS untuk NIK ${nik} tidak ditemukan.${rawMsg ? ` (${rawMsg})` : ""}`;
      } else if (rawMsg) {
        msg = `⚠️ ${rawMsg}`;
      } else {
        msg = "⚠️ Permintaan gagal. Periksa NIK & captcha, lalu coba lagi.";
      }
      return { ok: false, message: msg, rows: rows.filter((r) => Object.keys(r).length) };
    }


    return {
      ok: true,
      message: `Data BPJS untuk NIK ${nik} ditemukan`,
      rows,
    };
  });

export const lookupNopol = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string }) => {
    if (!input || typeof input.query !== "string" || !input.query.trim()) {
      throw new Error("Plat nomor wajib diisi");
    }
    return { query: input.query.trim() };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; message: string; rows: Record<string, string>[] }> => {
    const { query } = data;
    const url = `${NOPOL_ENDPOINT}?plat=${encodeURIComponent(query)}`;

    let json: Record<string, unknown> | unknown[];
    try {
      const trimmed = (await fetchUpstream(url)).trim();
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        return { ok: false, message: "Server data tidak mengembalikan JSON yang valid.", rows: [] };
      }
      json = JSON.parse(trimmed);
    } catch (e) {
      return {
        ok: false,
        message: `Gagal menghubungi server data: ${normalizeLookupErrorMessage((e as Error).message || String(e))}`,
        rows: [],
      };
    }

    const obj = (Array.isArray(json) ? { data: json } : json) as Record<string, unknown>;
    const status = obj.status;
    const isError =
      status === false ||
      String(status).toLowerCase() === "false" ||
      String(status).toLowerCase() === "error" ||
      obj.error === true;

    const dataField = obj.data ?? obj.result ?? obj;
    const rowsArr: Record<string, unknown>[] = Array.isArray(dataField)
      ? (dataField as Record<string, unknown>[])
      : [dataField as Record<string, unknown>];

    const rows = rowsArr.map((r) => {
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(r ?? {})) {
        if (v === null || v === undefined) continue;
        flat[k.toUpperCase()] = typeof v === "object" ? JSON.stringify(v) : String(v);
      }
      return flat;
    }).filter((r) => Object.keys(r).length);

    if (isError || rows.length === 0) {
      const msg = sanitizeLookupResultMessage(
        (obj.message as string) || (obj.result as string),
        "Data tidak ditemukan untuk plat nomor tersebut.",
      );
      return { ok: false, message: msg, rows };
    }

    return { ok: true, message: `Data kendaraan untuk plat ${query} ditemukan`, rows };
  });

export const lookupMahasiswa = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string }) => {
    if (!input || typeof input.query !== "string" || !input.query.trim()) {
      throw new Error("Nama / NIM wajib diisi");
    }
    return { query: input.query.trim() };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; message: string; rows: Record<string, string>[] }> => {
    const { query } = data;
    const url = `${MAHASISWA_ENDPOINT}?query=${encodeURIComponent(query)}`;

    let json: Record<string, unknown> | unknown[];
    try {
      const trimmed = (await fetchUpstream(url)).trim();
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        return { ok: false, message: "Server data tidak mengembalikan JSON yang valid.", rows: [] };
      }
      json = JSON.parse(trimmed);
    } catch (e) {
      return {
        ok: false,
        message: `Gagal menghubungi server data: ${normalizeLookupErrorMessage((e as Error).message || String(e))}`,
        rows: [],
      };
    }

    const obj = (Array.isArray(json) ? { data: json } : json) as Record<string, unknown>;
    const status = obj.status;
    const isError =
      status === false ||
      String(status).toLowerCase() === "false" ||
      String(status).toLowerCase() === "error" ||
      obj.error === true;

    const dataField = obj.mahasiswa ?? obj.data ?? obj.result ?? obj.results ?? obj;
    const rowsArr: Record<string, unknown>[] = Array.isArray(dataField)
      ? (dataField as Record<string, unknown>[])
      : [dataField as Record<string, unknown>];

    const rows = rowsArr.map((r) => {
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(r ?? {})) {
        if (v === null || v === undefined) continue;
        flat[k.toUpperCase()] = typeof v === "object" ? JSON.stringify(v) : String(v);
      }
      return flat;
    }).filter((r) => Object.keys(r).length);

    if (isError || rows.length === 0) {
      const msg = sanitizeLookupResultMessage(
        (obj.message as string) || (obj.result as string),
        "Data mahasiswa tidak ditemukan.",
      );
      return { ok: false, message: msg, rows };
    }

    return { ok: true, message: `Ditemukan ${rows.length} data mahasiswa untuk "${query}"`, rows };
  });

export const lookupGuru = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string }) => {
    if (!input || typeof input.query !== "string" || !input.query.trim()) {
      throw new Error("Nama guru wajib diisi");
    }
    return { query: input.query.trim() };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; message: string; rows: Record<string, string>[] }> => {
    const { query } = data;
    const url = `${GURU_ENDPOINT}?keyword=${encodeURIComponent(query)}`;

    // SIMPKB endpoint adalah HTTP plain di port 1991. Worker bisa fetch langsung,
    // sehingga tidak perlu lewat proxy publik (yang sering kena rate-limit).
    async function fetchDirect(): Promise<string> {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json, text/plain, */*",
          "User-Agent": "Mozilla/5.0 (compatible; OsintLookup/1.0)",
        },
        signal: AbortSignal.timeout(30_000),
      });
      const body = (await res.text()).trim();
      if (!res.ok || isRateLimitedText(body) || isBlockedProxyText(body)) {
        throw new Error(`HTTP ${res.status || 403}`);
      }
      return body;
    }

    let trimmed = "";
    let directErr = "";
    try {
      trimmed = await fetchDirect();
      if (isRateLimitedText(trimmed) || isBlockedProxyText(trimmed)) {
        directErr = normalizeLookupErrorMessage(trimmed || "HTTP 403");
        trimmed = "";
      }
    } catch (e) {
      directErr = normalizeLookupErrorMessage((e as Error).message || String(e));
    }

    // Jika direct gagal atau bukan JSON, baru fallback ke proxy
    if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
      try {
        trimmed = (await fetchUpstream(url)).trim();
      } catch (e) {
        const msg = normalizeLookupErrorMessage(directErr || (e as Error).message || String(e));
        return { ok: false, message: `Gagal menghubungi server SIMPKB: ${msg}`, rows: [] };
      }
    }

    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return { ok: false, message: "Server SIMPKB tidak mengembalikan JSON yang valid.", rows: [] };
    }

    let json: Record<string, unknown> | unknown[];
    try {
      json = JSON.parse(trimmed);
    } catch (e) {
      return { ok: false, message: `Gagal parsing JSON SIMPKB: ${(e as Error).message}`, rows: [] };
    }


    const obj = (Array.isArray(json) ? { data: json } : json) as Record<string, unknown>;
    const status = obj.status;
    const isError =
      status === false ||
      String(status).toLowerCase() === "false" ||
      String(status).toLowerCase() === "error" ||
      obj.error === true;

    const dataField = obj.guru ?? obj.data ?? obj.result ?? obj.results ?? obj.hasil ?? obj;
    const rowsArr: Record<string, unknown>[] = Array.isArray(dataField)
      ? (dataField as Record<string, unknown>[])
      : [dataField as Record<string, unknown>];

    const rows = rowsArr.map((r) => {
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(r ?? {})) {
        if (v === null || v === undefined) continue;
        flat[k.toUpperCase()] = typeof v === "object" ? JSON.stringify(v) : String(v);
      }
      return flat;
    }).filter((r) => Object.keys(r).length);

    if (isError || rows.length === 0) {
      const msg = sanitizeLookupResultMessage(
        (obj.message as string) || (obj.result as string),
        "Data guru tidak ditemukan.",
      );
      return { ok: false, message: msg, rows };
    }

    return { ok: true, message: `Ditemukan ${rows.length} data guru untuk "${query}"`, rows };
  });
