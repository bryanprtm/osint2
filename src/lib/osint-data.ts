import {
  IdCard, Users, User, HeartPulse, Car, Hash, Binary, Phone,
  Camera, ScanFace, Radio, Satellite, Newspaper, BarChart3,
  Network, Bug, ShieldAlert, Lock, FolderSearch, ShieldCheck, Globe2,
  Activity, Map, Calculator, PackageSearch, FileSearch, Mail, Cpu,
  FileDigit, Search, ScanLine, KeyRound, FileWarning, Link2, ShieldX,
  FileCode, FormInput, Code2, Flame, Swords, KeySquare, Unlock, Dices,
  TerminalSquare, FileJson, ArrowLeftRight, type LucideIcon,
} from "lucide-react";

export type Feature = {
  id: string;
  code: string;
  name: string;
  desc: string;
  input: string;
  placeholder: string;
  category:
    | "Identitas" | "Kendaraan" | "Telekomunikasi" | "Biometrik" | "Geo & Sinyal" | "Analitik"
    | "Cybersecurity" | "Jaringan" | "Web Exploit" | "Password & Kripto" | "Utilitas";
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

  // ── Cybersecurity / Vulnerability Scanning ─────────────────────────────────
  { id: "port-scanner", code: "SEC-015", name: "PORT SCANNER", desc: "Scan port terbuka & service yang berjalan", input: "Host / IP", placeholder: "scanme.nmap.org", category: "Cybersecurity", icon: Network },
  { id: "sql-injector", code: "SEC-016", name: "SQL INJECTOR", desc: "Uji kerentanan SQL injection pada URL", input: "URL Target", placeholder: "https://target.com/page?id=1", category: "Web Exploit", icon: Bug },
  { id: "xss-detector", code: "SEC-017", name: "XSS DETECTOR", desc: "Deteksi kerentanan Cross-Site Scripting", input: "URL Target", placeholder: "https://target.com/search?q=", category: "Web Exploit", icon: ShieldAlert },
  { id: "directory-scanner", code: "SEC-018", name: "DIRECTORY SCANNER", desc: "Temukan direktori & file tersembunyi", input: "URL Target", placeholder: "https://target.com", category: "Cybersecurity", icon: FolderSearch },
  { id: "ssl-scanner", code: "SEC-019", name: "SSL SCANNER", desc: "Analisa konfigurasi SSL/TLS & sertifikat", input: "Hostname", placeholder: "example.com", category: "Cybersecurity", icon: Lock },
  { id: "csrf-tester", code: "SEC-020", name: "CSRF TESTER", desc: "Uji kerentanan Cross-Site Request Forgery", input: "URL Form", placeholder: "https://target.com/form", category: "Web Exploit", icon: ShieldX },
  { id: "zap-scanner", code: "SEC-021", name: "OWASP ZAP SCANNER", desc: "Pemindai kerentanan web menyeluruh (OWASP)", input: "URL Target", placeholder: "https://target.com", category: "Cybersecurity", icon: ScanLine },

  // ── Jaringan ───────────────────────────────────────────────────────────────
  { id: "ping-sweep", code: "NET-022", name: "PING SWEEP", desc: "Temukan host aktif via ICMP", input: "Subnet / Range", placeholder: "192.168.1.0/24", category: "Jaringan", icon: Activity },
  { id: "traceroute", code: "NET-023", name: "TRACEROUTE", desc: "Lacak jalur paket ke host tujuan", input: "Host / IP", placeholder: "8.8.8.8", category: "Jaringan", icon: Map },
  { id: "dns-lookup", code: "NET-024", name: "DNS LOOKUP", desc: "Query record DNS suatu domain", input: "Domain", placeholder: "example.com", category: "Jaringan", icon: Globe2 },
  { id: "subnet-calculator", code: "NET-025", name: "SUBNET CALCULATOR", desc: "Hitung subnet mask & network address", input: "CIDR", placeholder: "192.168.1.0/24", category: "Jaringan", icon: Calculator },
  { id: "packet-analyzer", code: "NET-026", name: "PACKET ANALYZER", desc: "Analisa traffic & isi paket jaringan", input: "Interface / File", placeholder: "eth0 / capture.pcap", category: "Jaringan", icon: PackageSearch },

  // ── Information Gathering / Recon ──────────────────────────────────────────
  { id: "header-analyzer", code: "REC-027", name: "HEADER ANALYZER", desc: "Analisa HTTP header untuk isu keamanan", input: "URL", placeholder: "https://target.com", category: "Cybersecurity", icon: FileSearch },
  { id: "email-hunter", code: "REC-028", name: "EMAIL HUNTER", desc: "Temukan email yang terkait dengan domain", input: "Domain", placeholder: "example.com", category: "Cybersecurity", icon: Mail },
  { id: "tech-detector", code: "REC-029", name: "TECH DETECTOR", desc: "Identifikasi teknologi yang digunakan situs", input: "URL", placeholder: "https://target.com", category: "Cybersecurity", icon: Cpu },
  { id: "metadata-extractor", code: "REC-030", name: "METADATA EXTRACTOR", desc: "Ekstrak metadata dokumen & gambar", input: "URL / File", placeholder: "https://target.com/file.pdf", category: "Cybersecurity", icon: FileDigit },
  { id: "phone-doxing", code: "REC-031", name: "PHONE DOXING", desc: "Info nomor HP: operator & jejak digital", input: "Nomor HP", placeholder: "+62812xxxxxxxx", category: "Cybersecurity", icon: Phone },
  { id: "whois-lookup", code: "REC-032", name: "WHOIS LOOKUP", desc: "WHOIS domain lengkap dengan visualisasi", input: "Domain", placeholder: "example.com", category: "Cybersecurity", icon: Search },
  { id: "search-engines", code: "REC-033", name: "SEARCH ENGINES", desc: "Pencarian intelijen lintas mesin pencari", input: "Keyword / Dork", placeholder: "site:gov.id filetype:pdf", category: "Cybersecurity", icon: Search },

  // ── Security Testing ───────────────────────────────────────────────────────
  { id: "password-checker", code: "SEC-034", name: "PASSWORD CHECKER", desc: "Uji kekuatan password & deteksi kebocoran", input: "Password", placeholder: "********", category: "Password & Kripto", icon: KeyRound },
  { id: "file-scanner", code: "SEC-035", name: "FILE SCANNER", desc: "Pindai malware & konten mencurigakan file", input: "URL / Hash", placeholder: "https://... atau SHA256", category: "Cybersecurity", icon: FileWarning },
  { id: "url-scanner", code: "SEC-036", name: "URL SCANNER", desc: "Cek URL terhadap phishing & reputasi", input: "URL", placeholder: "https://suspicious.link", category: "Cybersecurity", icon: Link2 },
  { id: "cors-tester", code: "SEC-037", name: "CORS TESTER", desc: "Uji konfigurasi Cross-Origin Resource Sharing", input: "URL Endpoint", placeholder: "https://api.target.com", category: "Cybersecurity", icon: ShieldCheck },

  // ── Web Exploitation ───────────────────────────────────────────────────────
  { id: "lfi-scanner", code: "WEB-038", name: "LFI SCANNER", desc: "Deteksi kerentanan Local File Inclusion", input: "URL Target", placeholder: "https://target.com/?file=", category: "Web Exploit", icon: FileCode },
  { id: "rfi-scanner", code: "WEB-039", name: "RFI SCANNER", desc: "Deteksi kerentanan Remote File Inclusion", input: "URL Target", placeholder: "https://target.com/?inc=", category: "Web Exploit", icon: FileCode },
  { id: "form-fuzzer", code: "WEB-040", name: "FORM FUZZER", desc: "Uji input form untuk validasi & injection", input: "URL Form", placeholder: "https://target.com/login", category: "Web Exploit", icon: FormInput },
  { id: "xml-injector", code: "WEB-041", name: "XML INJECTOR", desc: "Uji XXE (XML External Entity)", input: "URL Endpoint", placeholder: "https://target.com/api", category: "Web Exploit", icon: Code2 },
  { id: "beef-xss", code: "WEB-042", name: "BeEF XSS", desc: "Browser Exploitation Framework untuk XSS", input: "URL Target", placeholder: "https://target.com", category: "Web Exploit", icon: Flame },
  { id: "payload-all-star", code: "WEB-043", name: "PAYLOAD ALL STAR", desc: "Koleksi payload eksploitasi web", input: "Tipe Payload", placeholder: "sqli / xss / ssti", category: "Web Exploit", icon: Swords },

  // ── Password & Kripto ──────────────────────────────────────────────────────
  { id: "hash-generator", code: "PWD-044", name: "HASH GENERATOR", desc: "Generate hash (MD5, SHA1, SHA256, dll)", input: "Plaintext", placeholder: "teks yang akan di-hash", category: "Password & Kripto", icon: KeySquare },
  { id: "hash-cracker", code: "PWD-045", name: "HASH CRACKER", desc: "Crack hash via dictionary & brute force", input: "Hash", placeholder: "5f4dcc3b5aa765d61d8327deb882cf99", category: "Password & Kripto", icon: Unlock },
  { id: "password-generator", code: "PWD-046", name: "PASSWORD GENERATOR", desc: "Buat password acak yang kuat", input: "Panjang", placeholder: "16", category: "Password & Kripto", icon: Dices },

  // ── Shell & Utilitas ───────────────────────────────────────────────────────
  { id: "shell-uploader", code: "UTL-047", name: "SHELL UPLOADER", desc: "Analisa kerentanan upload shell", input: "URL Target", placeholder: "https://target.com/upload", category: "Web Exploit", icon: TerminalSquare },
  { id: "base64-encoder", code: "UTL-048", name: "BASE64 ENCODER", desc: "Encode/decode data menggunakan Base64", input: "Teks / Base64", placeholder: "Halo dunia", category: "Utilitas", icon: ArrowLeftRight },
  { id: "hex-converter", code: "UTL-049", name: "HEX CONVERTER", desc: "Konversi heksadesimal ↔ teks/desimal", input: "Hex / Teks", placeholder: "48656c6c6f", category: "Utilitas", icon: Binary },
  { id: "json-formatter", code: "UTL-050", name: "JSON FORMATTER", desc: "Format & validasi data JSON", input: "JSON String", placeholder: '{"key":"value"}', category: "Utilitas", icon: FileJson },
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
