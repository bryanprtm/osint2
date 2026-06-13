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
    let rawText = "";
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json, text/plain, */*",
          "User-Agent": "Mozilla/5.0 (compatible; OsintLookup/1.0)",
        },
        signal: AbortSignal.timeout(25_000),
      });
      rawText = await res.text();
      // Detect Cloudflare / upstream non-JSON error pages (e.g. "error code: 1003").
      const trimmed = rawText.trim();
      if (!trimmed) {
        return { ok: false, message: "Server data mengembalikan respon kosong. Coba lagi sebentar.", rows: [] };
      }
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        const m = trimmed.match(/error code:\s*(\d+)/i);
        if (m) {
          const code = m[1];
          const hint =
            code === "1003"
              ? "Akses langsung via IP diblokir oleh jaringan upstream (Cloudflare 1003). Hubungi penyedia API untuk membuka akses atau gunakan domain resmi."
              : `Upstream mengembalikan error code ${code}.`;
          return { ok: false, message: hint, rows: [] };
        }
        return {
          ok: false,
          message: `Server data tidak mengembalikan JSON (HTTP ${res.status}). Coba lagi nanti.`,
          rows: [],
        };
      }
      try {
        json = JSON.parse(trimmed) as ApiResponse;
      } catch {
        return {
          ok: false,
          message: "Format respon server data tidak valid (JSON gagal di-parse).",
          rows: [],
        };
      }
    } catch (e) {
      const msg = (e as Error).message || String(e);
      return {
        ok: false,
        message: `Gagal menghubungi server data: ${msg}`,
        rows: [],
      };
    }

    if (!json.status) {
      return { ok: false, message: json.message || "Data tidak ditemukan", rows: [] };
    }

    const rows = json.data.map(mapRow);
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
