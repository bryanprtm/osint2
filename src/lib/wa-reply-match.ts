export type WaReplyCandidate = {
  feature_id: string;
  command_sent: string;
  query: string;
  created_at: string;
};

export function commandKeyword(command: unknown): string {
  const first = String(command ?? "").toLowerCase().trim().split(/\s+/)[0] ?? "";
  return first.replace(/^\//, "");
}

function normalizeLookupText(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function addAliases(keys: Set<string>, value: unknown) {
  const raw = String(value ?? "").toLowerCase().trim();
  if (!raw) return;
  keys.add(raw);
  if (raw.endsWith("detail")) keys.add(raw.replace(/detail$/, ""));
  if (raw === "plat") keys.add("nopol");
  if (raw === "nopol") keys.add("plat");
  if (raw === "name") keys.add("nama");
  if (raw === "nama") keys.add("name");
  if (raw === "mhs") keys.add("mahasiswa");
  if (raw === "mahasiswa") keys.add("mhs");
  if (raw === "simpkb") keys.add("guru");
  if (raw === "guru") keys.add("simpkb");
  if (raw === "cp" || raw === "msisdn" || raw === "data") {
    keys.add("cp");
    keys.add("msisdn");
    keys.add("phone");
    keys.add("data");
  }
  if (raw === "nkes" || raw === "bpjs") {
    keys.add("nkes");
    keys.add("bpjs");
    keys.add("nik");
  }


function candidateKeys(candidate: WaReplyCandidate): Set<string> {
  const keys = new Set<string>();
  addAliases(keys, candidate.feature_id);
  addAliases(keys, commandKeyword(candidate.command_sent));
  return keys;
}

function messageMentionsAnyKey(message: string, keys: Set<string>): boolean {
  return [...keys].some((key) => key.length >= 3 && new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(message));
}

export function detectReplyIntents(message: string): Set<string> {
  const lower = message.toLowerCase();
  const intents = new Set<string>();
  const hasNopol = /^\s*nopol\s*:/im.test(lower) || /\bpemilik\s*:/i.test(lower) || /\bmerk\s*:/i.test(lower);
  const hasMsisdn = /^\s*msisdn\s*:/im.test(lower) || /\bimsi\s*:/i.test(lower) || /\blac\s*:/i.test(lower);
  const hasNama = /^\s*nama\s*:/im.test(lower) && (/\bttl\s*:/i.test(lower) || /\bnama ayah\s*:/i.test(lower) || /\bnama ibu\s*:/i.test(lower));
  const hasKk = /\b(no\.?\s*kk|kartu keluarga|kepala keluarga)\b/i.test(lower);
  const hasMahasiswa = /\b(nim|mahasiswa|perguruan tinggi|prodi|program studi)\b/i.test(lower);
  const hasGuru = /\b(guru|nuptk|npsn|sekolah|simpkb|ptk)\b/i.test(lower);
  const hasBpjs = /\b(bpjs|jkn|kis|faskes|peserta)\b/i.test(lower);

  if (hasNopol) {
    intents.add("nopol");
    intents.add("plat");
  } else if (hasMsisdn) {
    intents.add("cp");
    intents.add("msisdn");
    intents.add("phone");
  } else if (hasNama) {
    intents.add("nama");
    intents.add("name");
  } else if (hasKk) {
    intents.add("kk");
    intents.add("kkdetail");
  } else if (/^\s*nik\s*:/im.test(lower)) {
    intents.add("nik");
    intents.add("nikdetail");
  } else if (/\bimei\s*:/i.test(lower)) {
    intents.add("imei");
  } else if (hasMahasiswa) {
    intents.add("mahasiswa");
    intents.add("mhs");
  } else if (hasGuru) {
    intents.add("guru");
    intents.add("simpkb");
  } else if (hasBpjs) {
    intents.add("bpjs");
  }

  return intents;
}

export function scoreWaReplyMatch(
  candidate: WaReplyCandidate,
  message: string,
  replyTime: number,
  allowTimeFallback: boolean,
): number {
  const sentAt = new Date(candidate.created_at).getTime();
  const diffMs = replyTime - sentAt;
  if (!Number.isFinite(sentAt) || diffMs < -5_000 || diffMs > 30 * 60 * 1000) return -1;

  const lower = message.toLowerCase();
  const normalizedMessage = normalizeLookupText(message);
  const queryText = String(candidate.query ?? "").toLowerCase().trim();
  const normalizedQuery = normalizeLookupText(candidate.query);
  const keys = candidateKeys(candidate);
  const intents = detectReplyIntents(message);
  const intentHit = [...intents].some((intent) => keys.has(intent));
  const hasIntent = intents.size > 0;
  const commandText = commandKeyword(candidate.command_sent);
  const featureText = String(candidate.feature_id ?? "").toLowerCase().trim();
  const recency = Math.max(0, 30 * 60 * 1000 - diffMs) / 1000;

  let score = 0;
  if (intentHit) score += 50_000;
  if (hasIntent && !intentHit) score -= 40_000;

  if (normalizedQuery && normalizedQuery.length >= 3 && normalizedMessage.includes(normalizedQuery)) {
    score += 20_000 + normalizedQuery.length * 100;
  } else if (queryText && lower.includes(queryText)) {
    score += 10_000 + queryText.length * 100;
  }

  if (commandText && lower.includes(commandText)) score += 5_000 + commandText.length * 50;
  if (featureText && lower.includes(featureText)) score += 3_000 + featureText.length * 25;
  if (!hasIntent && messageMentionsAnyKey(message, keys)) score += 2_000;

  if (score > 0) return score + recency;
  if (!allowTimeFallback || hasIntent) return -1;
  return 100 + recency;
}

export function pickBestWaReplyMatch<T extends WaReplyCandidate>(
  candidates: T[],
  message: string,
  replyTime: number,
  allowTimeFallback: boolean,
): T | undefined {
  return candidates
    .map((row) => ({ row, score: scoreWaReplyMatch(row, message, replyTime, allowTimeFallback) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score || new Date(b.row.created_at).getTime() - new Date(a.row.created_at).getTime())[0]?.row;
}