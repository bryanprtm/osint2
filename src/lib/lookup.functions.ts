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
// Cloudflare Workers (runtime Lovable Cloud) memblokir fetch langsung ke IP publik
// dengan error code 1003. Karena penyedia API belum punya domain, kita rutekan
// request melalui Jina Reader sebagai HTTP proxy (gratis, tanpa API key).
const PROXY = "https://r.jina.ai/";

function extractJsonPayload(raw: string): string {
  const text = raw.trim();
  if (!text) return "";

  if (text.startsWith("{") || text.startsWith("[")) {
    return text;
  }

  try {
    const parsed = JSON.parse(text) as { data?: { text?: string } };
    const inner = parsed?.data?.text?.trim();
    if (inner) return extractJsonPayload(inner);
  } catch {
    // ignore: lanjut ke format proxy lain
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

  const firstJsonIndex = Math.max(text.indexOf("{"), text.indexOf("["));
  if (firstJsonIndex >= 0) {
    const candidate = text.slice(firstJsonIndex).trim();
    if (candidate.startsWith("{") || candidate.startsWith("[")) {
      return candidate;
    }
  }

  return "";
}

async function fetchUpstream(url: string): Promise<string> {
  // 1) Coba langsung dulu (jika environment mengizinkan akses IP).
  try {
    const direct = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (compatible; OsintLookup/1.0)",
      },
      signal: AbortSignal.timeout(45_000),
    });
    const txt = extractJsonPayload(await direct.text());
    if (txt) return txt;
    // fallthrough ke proxy bila non-JSON (mis. error 1003)
  } catch {
    // fallthrough ke proxy
  }

  // 2) Fallback via Jina Reader proxy. Di beberapa environment, Jina bisa
  //    mengembalikan JSON wrapper ATAU markdown/plain text, jadi keduanya didukung.
  const proxyCandidates = [`${PROXY}${url}`, `${PROXY}http://${url.replace(/^https?:\/\//, "")}`];

  for (const proxyUrl of proxyCandidates) {
    try {
      const res = await fetch(proxyUrl, {
        method: "GET",
        headers: {
          Accept: "application/json, text/plain, */*",
          "X-Return-Format": "text",
          "User-Agent": "Mozilla/5.0 (compatible; OsintLookup/1.0)",
        },
        signal: AbortSignal.timeout(60_000),
      });
      const extracted = extractJsonPayload(await res.text());
      if (extracted) return extracted;
    } catch {
      // coba kandidat proxy berikutnya
    }
  }

  throw new Error("Proxy tidak mengembalikan isi data");
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
      const msg = (e as Error).message || String(e);
      return {
        ok: false,
        message: `Gagal menghubungi server data: ${msg}`,
        rows: [],
      };
    }

    if (!json || !json.status) {
      const msg = (json && "message" in json && json.message) || "Data tidak ditemukan";
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
      return { ok: false, message: `Gagal menghubungi server data: ${(e as Error).message || String(e)}`, rows: [] };
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
      const msg = (json.result as string) || (json.message as string) || "IMEI tidak valid / data tidak ditemukan.";
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

async function fetchBpjsOnce(url: string, init?: RequestInit): Promise<{ contentType: string; bytes: Uint8Array; text: string; setCookie: string | null } | null> {
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
    if (!r.ok && r.status >= 500) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    return {
      contentType: r.headers.get("content-type") || "",
      bytes: buf,
      text: new TextDecoder().decode(buf),
      setCookie: r.headers.get("set-cookie"),
    };
  } catch {
    return null;
  }
}

async function fetchBpjsRaw(url: string, init?: RequestInit): Promise<{ contentType: string; bytes: Uint8Array; text: string; setCookie: string | null }> {
  // 1) direct (boleh gagal di Cloudflare Workers untuk IP publik → error 1003)
  const direct = await fetchBpjsOnce(url, init);
  if (direct && direct.bytes.length > 0 && !/error code: ?1003/i.test(direct.text)) {
    return direct;
  }

  // 2) Proxy biner-safe yang meneruskan body apa adanya
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
  for (const purl of proxies) {
    const r = await fetchBpjsOnce(purl, init);
    if (r && r.bytes.length > 0 && !/error code: ?1003/i.test(r.text)) {
      return r;
    }
  }
  throw new Error("Semua proxy gagal menjangkau server BPJS");
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
      if (res.text.trim().startsWith("{")) {
        try {
          const j = JSON.parse(res.text) as Record<string, unknown>;
          const captcha =
            (j.captcha as string) ||
            (j.image as string) ||
            (j.data as string) ||
            "";
          const sessionId =
            (j.sessionId as string) ||
            (j.session_id as string) ||
            (j.session as string) ||
            ownSession;
          if (captcha) {
            const dataUri = captcha.startsWith("data:")
              ? captcha
              : `data:image/png;base64,${captcha.replace(/^data:.*;base64,/, "")}`;
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
    try {
      parsed = JSON.parse(text);
    } catch {
      // Mungkin seluruh response adalah ciphertext base64
      const dec = tryAesDecrypt(text);
      if (dec) {
        try { parsed = JSON.parse(dec); } catch { parsed = { result: dec }; }
      } else {
        return { ok: false, message: "Server BPJS tidak mengembalikan JSON yang valid.", rows: [] };
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
      const msg =
        (obj.message as string) ||
        (obj.result as string) ||
        "Captcha salah / data tidak ditemukan. Muat captcha baru lalu coba lagi.";
      return { ok: false, message: msg, rows: rows.filter((r) => Object.keys(r).length) };
    }

    return {
      ok: true,
      message: `Data BPJS untuk NIK ${nik} ditemukan`,
      rows,
    };
  });
