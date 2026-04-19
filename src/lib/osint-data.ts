import {
  IdCard, Users, User, HeartPulse, Car, Hash, Binary, Phone,
  Camera, ScanFace, Radio, Satellite, Newspaper, BarChart3, type LucideIcon,
} from "lucide-react";

export type Feature = {
  id: string;
  code: string;
  name: string;
  desc: string;
  input: string;
  placeholder: string;
  category: "Identitas" | "Kendaraan" | "Telekomunikasi" | "Biometrik" | "Geo & Sinyal" | "Analitik";
  icon: LucideIcon;
};

export const FEATURES: Feature[] = [
  { id: "nik", code: "OSI-001", name: "CEK NIK", desc: "Pencarian data kependudukan via NIK", input: "NIK (16 digit)", placeholder: "3578xxxxxxxxxxxx", category: "Identitas", icon: IdCard },
  { id: "kk", code: "OSI-002", name: "CEK KK", desc: "Data Kartu Keluarga lengkap", input: "Nomor KK", placeholder: "3578xxxxxxxxxxxx", category: "Identitas", icon: Users },
  { id: "nama", code: "OSI-003", name: "CEK NAMA", desc: "Pencarian massal berdasarkan nama lengkap", input: "Nama Lengkap", placeholder: "FEBRYAN PRATAMA PUTRA", category: "Identitas", icon: User },
  { id: "bpjs", code: "OSI-004", name: "CEK BPJS", desc: "Status kepesertaan BPJS Kesehatan", input: "NIK", placeholder: "3578xxxxxxxxxxxx", category: "Identitas", icon: HeartPulse },
  { id: "nopol", code: "OSI-005", name: "CEK NOPOL", desc: "Informasi kendaraan via Nomor Polisi", input: "Plat Nomor", placeholder: "L 1234 ABC", category: "Kendaraan", icon: Car },
  { id: "noka", code: "OSI-006", name: "CEK NOKA", desc: "Lookup kendaraan via Nomor Rangka", input: "Nomor Rangka", placeholder: "MH1JFXXXXXXXXX", category: "Kendaraan", icon: Hash },
  { id: "nosin", code: "OSI-007", name: "CEK NOSIN", desc: "Lookup kendaraan via Nomor Mesin", input: "Nomor Mesin", placeholder: "JFXXXXXXXX", category: "Kendaraan", icon: Binary },
  { id: "regnik", code: "OSI-008", name: "CEK REGISTRASI (NIK→PHONE)", desc: "Mapping NIK ke nomor HP terdaftar", input: "NIK", placeholder: "3578xxxxxxxxxxxx", category: "Telekomunikasi", icon: Phone },
  { id: "regphone", code: "OSI-009", name: "CEK REGISTRASI (PHONE→NIK)", desc: "Mapping nomor HP ke NIK pemilik", input: "Nomor HP", placeholder: "628xxxxxxxxx", category: "Telekomunikasi", icon: Phone },
  { id: "nik2photo", code: "OSI-010", name: "NIK TO PHOTO", desc: "Tampilkan foto KTP berdasarkan NIK", input: "NIK", placeholder: "3578xxxxxxxxxxxx", category: "Biometrik", icon: Camera },
  { id: "fr", code: "OSI-011", name: "FACE RECOGNITION", desc: "Pencocokan wajah lintas database", input: "URL Foto / Upload", placeholder: "https://...", category: "Biometrik", icon: ScanFace },
  { id: "bts", code: "OSI-012", name: "ANALISA BTS", desc: "Estimasi lokasi via sinyal seluler & BTS", input: "Nomor HP", placeholder: "628xxxxxxxxx", category: "Geo & Sinyal", icon: Radio },
  { id: "pos", code: "OSI-013", name: "POS ALL OPERATOR", desc: "Pelacakan posisi lintas operator", input: "Nomor HP", placeholder: "628xxxxxxxxx", category: "Geo & Sinyal", icon: Satellite },
  { id: "media", code: "OSI-014", name: "MEDIA MONITORING", desc: "Monitoring berita & sosial media", input: "Keyword / Nama", placeholder: "kata kunci...", category: "Analitik", icon: Newspaper },
];

export type OsintResult = {
  status: boolean;
  query: string;
  feature: string;
  timestamp: string;
  data: Record<string, unknown>[];
};

export function generateMockResult(featureId: string, query: string): OsintResult {
  const ts = new Date().toISOString();
  const base = { status: true, query, feature: featureId, timestamp: ts };

  switch (featureId) {
    case "nik":
    case "nama":
    case "kk":
      return {
        ...base,
        data: [
          {
            ID: 116301499,
            NIK: "3578122102900002",
            NAMA: "FEBRYAN PRATAMA PUTRA",
            JENIS_KELAMIN: "Laki-Laki",
            TANGGAL_LAHIR: "21 Feb 1990",
            TELPON: "6282221608856",
            ALAMAT: "PESAPEN 3/84 RT 4 RW 1 KREMBANGAN UTARA PABEAN CANTIAN KOTA SURABAYA JAWA TIMUR",
            KELURAHAN: "KREMBANGAN UTARA",
            KOTA: "KOTA SURABAYA",
            ID_PROVINSI: 35,
          },
          {
            ID: 49383335,
            NIK: "3578262205890004",
            NAMA: "TAN BRYAN PRATAMA SUTANTO",
            JENIS_KELAMIN: "Laki-Laki",
            TANGGAL_LAHIR: "22 Mei 1989",
            TELPON: "6281330024411",
            ALAMAT: "JL. KERTAJAYA INDAH TIMUR VIII / 12",
            KELURAHAN: "MANYAR SABRANGAN",
            KOTA: "KOTA SURABAYA",
            ID_PROVINSI: 35,
          },
        ],
      };
    case "bpjs":
      return {
        ...base,
        data: [{
          NIK: query, NO_BPJS: "0001234567890", NAMA: "FEBRYAN PRATAMA PUTRA",
          KELAS: "II", STATUS: "AKTIF", FASKES: "PUSKESMAS KREMBANGAN",
          PREMI_TERAKHIR: "2026-04-01",
        }],
      };
    case "nopol":
    case "noka":
    case "nosin":
      return {
        ...base,
        data: [{
          NOPOL: "L 1234 ABC", MERK: "HONDA", TIPE: "VARIO 160 CBS",
          TAHUN: 2024, WARNA: "HITAM DOFF", NOKA: "MH1KF8110XK123456",
          NOSIN: "KF81E1123456", PEMILIK: "FEBRYAN PRATAMA PUTRA",
          ALAMAT: "PESAPEN 3/84 SURABAYA", PAJAK: "2026-08-12", STATUS: "AKTIF",
        }],
      };
    case "regnik":
    case "regphone":
      return {
        ...base,
        data: [
          { OPERATOR: "TELKOMSEL", MSISDN: "6282221608856", REG_DATE: "2019-04-12", STATUS: "AKTIF" },
          { OPERATOR: "INDOSAT", MSISDN: "6285731112233", REG_DATE: "2021-09-01", STATUS: "AKTIF" },
          { OPERATOR: "XL", MSISDN: "6287877889900", REG_DATE: "2018-02-20", STATUS: "NONAKTIF" },
        ],
      };
    case "nik2photo":
      return {
        ...base,
        data: [{ NIK: query, NAMA: "FEBRYAN PRATAMA PUTRA", FOTO_URL: "https://placehold.co/240x320/0a1929/00e5ff?text=KTP", STATUS_FOTO: "TERSEDIA" }],
      };
    case "fr":
      return {
        ...base,
        data: [
          { MATCH_ID: "FR-9981", NAMA: "FEBRYAN PRATAMA PUTRA", CONFIDENCE: "94.2%", SOURCE: "DUKCAPIL" },
          { MATCH_ID: "FR-9982", NAMA: "FEBRIAN P. P.", CONFIDENCE: "81.5%", SOURCE: "SIM-POLRI" },
        ],
      };
    case "bts":
    case "pos":
      return {
        ...base,
        data: [
          { BTS_ID: "TSEL-SBY-04421", LAT: -7.2459, LONG: 112.7378, SIGNAL: "-78 dBm", LAST_SEEN: "2026-04-19 12:18:04" },
          { BTS_ID: "TSEL-SBY-04418", LAT: -7.2491, LONG: 112.7401, SIGNAL: "-86 dBm", LAST_SEEN: "2026-04-19 11:42:11" },
        ],
      };
    case "media":
      return {
        ...base,
        data: [
          { SUMBER: "detik.com", JUDUL: `Pemberitaan terkait "${query}"`, SENTIMEN: "NETRAL", TGL: "2026-04-18" },
          { SUMBER: "twitter/x", JUDUL: `Mention "${query}" trending lokal`, SENTIMEN: "POSITIF", TGL: "2026-04-19" },
          { SUMBER: "kompas.com", JUDUL: `Analisis "${query}"`, SENTIMEN: "NEGATIF", TGL: "2026-04-15" },
        ],
      };
    default:
      return { ...base, data: [{ message: "Tidak ada data" }] };
  }
}
