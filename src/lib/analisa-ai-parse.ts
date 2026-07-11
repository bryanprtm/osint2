// Parser balasan bot WhatsApp untuk fitur ANALISA AI TARGET.
// Regex sengaja toleran: bot bisa merespon dalam format bebas (label bercampur emoji/tanda baca).

export type CpParsed = {
  lat?: number;
  long?: number;
  bts_id?: string;
  address?: string;
  signal?: string;
  last_seen?: string;
};

export type DataPhoneParsed = {
  nik?: string;
  kk?: string;
  nama?: string;
  alamat?: string;
  tgl_lahir?: string;
  jenis_kelamin?: string;
  kota?: string;
  provinsi?: string;
};

export type BtsPointParsed = {
  bts_id?: string;
  lat?: number;
  long?: number;
  address?: string;
  distance?: string;
  /** Jarak ke target dalam meter (hasil parsing angka dari `distance`). */
  distance_m?: number;
};

export type ClosestBtsParsed = {
  points: BtsPointParsed[];
};

function toNumber(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function pick(text: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return undefined;
}

function findLatLong(text: string): { lat?: number; long?: number } {
  // Bentuk pertama: "LAT: -7.2459, LONG: 112.7378"
  const latLabel = pick(text, [/lat(?:itude)?\s*[:=]\s*(-?\d+\.\d+)/i]);
  const lngLabel = pick(text, [/lon(?:g(?:itude)?)?\s*[:=]\s*(-?\d+\.\d+)/i]);
  if (latLabel && lngLabel) return { lat: toNumber(latLabel), long: toNumber(lngLabel) };

  // Bentuk kedua: pasangan koordinat "-7.2459,112.7378" atau "-7.2459 112.7378"
  const pair = text.match(/(-?\d{1,2}\.\d{3,7})\s*[, ]\s*(\d{2,3}\.\d{3,7})/);
  if (pair) return { lat: toNumber(pair[1]), long: toNumber(pair[2]) };

  return {};
}

export function parseCpReply(text: string): CpParsed {
  const { lat, long } = findLatLong(text);
  const bts_id = pick(text, [
    /bts[_\s-]*id\s*[:=]\s*([A-Z0-9\-_]+)/i,
    /\b(tsel-[a-z0-9-]+)\b/i,
    /\b(isat-[a-z0-9-]+)\b/i,
    /\b(xl-[a-z0-9-]+)\b/i,
    /tower\s*[:=]\s*([A-Z0-9\-_]+)/i,
  ]);
  const address = pick(text, [/alamat\s*[:=]\s*(.+?)(?:\n|$)/i, /address\s*[:=]\s*(.+?)(?:\n|$)/i]);
  const signal = pick(text, [/signal\s*[:=]\s*([^\n]+)/i, /sinyal\s*[:=]\s*([^\n]+)/i]);
  const last_seen = pick(text, [/last[_\s-]*seen\s*[:=]\s*([^\n]+)/i, /terakhir\s*[:=]\s*([^\n]+)/i]);
  return { lat, long, bts_id, address, signal, last_seen };
}

export function parseDataPhoneReply(text: string): DataPhoneParsed {
  const nik = pick(text, [/\bnik\s*[:=]\s*(\d{16})/i, /\b(\d{16})\b/]);
  const kk = pick(text, [/\bkk\s*[:=]\s*(\d{16})/i, /kartu\s*keluarga\s*[:=]\s*(\d{16})/i]);
  return {
    nik,
    kk,
    nama: pick(text, [/\bnama\s*[:=]\s*([^\n]+)/i, /\bname\s*[:=]\s*([^\n]+)/i]),
    alamat: pick(text, [/\balamat\s*[:=]\s*([^\n]+)/i, /\baddress\s*[:=]\s*([^\n]+)/i]),
    tgl_lahir: pick(text, [/tgl[_\s-]*lahir\s*[:=]\s*([^\n]+)/i, /tanggal\s*lahir\s*[:=]\s*([^\n]+)/i, /dob\s*[:=]\s*([^\n]+)/i]),
    jenis_kelamin: pick(text, [/jenis[_\s-]*kelamin\s*[:=]\s*([^\n]+)/i, /gender\s*[:=]\s*([^\n]+)/i]),
    kota: pick(text, [/\bkota\s*[:=]\s*([^\n]+)/i, /kabupaten\s*[:=]\s*([^\n]+)/i]),
    provinsi: pick(text, [/provinsi\s*[:=]\s*([^\n]+)/i]),
  };
}

export function parseConvertBtsReply(text: string): BtsPointParsed {
  const { lat, long } = findLatLong(text);
  return {
    lat,
    long,
    bts_id: pick(text, [/bts[_\s-]*id\s*[:=]\s*([A-Z0-9\-_]+)/i, /tower\s*[:=]\s*([A-Z0-9\-_]+)/i]),
    address: pick(text, [/alamat\s*[:=]\s*([^\n]+)/i, /address\s*[:=]\s*([^\n]+)/i]),
  };
}

export function parseClosestBtsReply(text: string): ClosestBtsParsed {
  // Coba parsing tiap blok BTS (baris/paragraf terpisah).
  const blocks = text.split(/\n{2,}|\r\n\r\n/).filter((b) => b.trim().length > 0);
  const points: BtsPointParsed[] = [];
  for (const b of blocks) {
    const { lat, long } = findLatLong(b);
    if (lat == null && long == null) continue;
    points.push({
      lat,
      long,
      bts_id: pick(b, [/bts[_\s-]*id\s*[:=]\s*([A-Z0-9\-_]+)/i, /\b(tsel-[a-z0-9-]+|isat-[a-z0-9-]+|xl-[a-z0-9-]+)\b/i]),
      address: pick(b, [/alamat\s*[:=]\s*([^\n]+)/i, /address\s*[:=]\s*([^\n]+)/i]),
      distance: pick(b, [/(?:jarak|distance)\s*[:=]\s*([^\n]+)/i]),
    });
  }
  // Fallback: kumpulkan semua pasangan lat/long yang tampak di teks.
  if (points.length === 0) {
    const re = /(-?\d{1,2}\.\d{3,7})\s*[, ]\s*(\d{2,3}\.\d{3,7})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      points.push({ lat: toNumber(m[1]), long: toNumber(m[2]) });
    }
  }
  return { points };
}

/** Buat rekaman generik untuk tabel command yang tidak punya parser khusus. */
export function tabulateKeyValue(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(/^([A-Za-z][\w .()\-\/]{1,40})\s*[:=]\s*(.+)$/);
    if (m) out[m[1].trim().toUpperCase()] = m[2].trim();
  }
  return out;
}
