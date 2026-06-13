import { createServerFn } from "@tanstack/react-start";

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
