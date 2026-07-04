// lib/sheet.ts
// ดึงข้อมูลจาก Google Sheet หลายแท็บ พร้อม in-memory cache

// ─── Types ────────────────────────────────────────────────
export interface FaqRow {
  question: string;
  answer: string;
}

export interface MemberRow {
  code: string;
  name: string;
  tier: "B2B" | "B2C";
}

export interface PriceRow {
  id: string;
  product: string;
  b2b: number;
  b2c: number;
  stock: number;
  reserved: number;
  remaining: number;
}

export interface PackageRow {
  phase: string; // "1" หรือ "3"
  name: string;
  inverter: string;
  panel: string;
  battery: string;
  price: number;
  note: string;
}

// ─── Cache ────────────────────────────────────────────────
interface Cache<T> {
  data: T[];
  fetchedAt: number;
}

const CACHE_TTL = 60 * 1000; // 60 วินาที
let faqCache: Cache<FaqRow> | null = null;
let memberCache: Cache<MemberRow> | null = null;
let priceCache: Cache<PriceRow> | null = null;
let packageCache: Cache<PackageRow> | null = null;

// ─── CSV Helpers ──────────────────────────────────────────
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

async function fetchCsv(url: string): Promise<string[][]> {
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => splitCsvLine(l));
}

function toNum(s: string): number {
  return parseFloat(s.replace(/,/g, "")) || 0;
}

// ─── FAQ (แท็บหลัก) ───────────────────────────────────────
export async function getFaq(): Promise<FaqRow[]> {
  const now = Date.now();
  if (faqCache && now - faqCache.fetchedAt < CACHE_TTL) return faqCache.data;
  const url = process.env.SHEET_CSV_URL;
  if (!url) {
    console.error("[sheet] SHEET_CSV_URL not set");
    return faqCache?.data ?? [];
  }
  try {
    const rows = await fetchCsv(url);
    const data = rows.slice(1).map((cols) => ({
      question: cols[0] ?? "",
      answer: cols[1] ?? "",
    })).filter((r) => r.question && r.answer);
    faqCache = { data, fetchedAt: now };
    console.log(`[sheet] FAQ: ${data.length} rows`);
    return data;
  } catch (err) {
    console.error("[sheet] FAQ fetch failed:", err);
    return faqCache?.data ?? [];
  }
}

export function faqToText(faq: FaqRow[]): string {
  if (!faq.length) return "(ไม่มีข้อมูล FAQ)";
  return faq
    .map((r, i) => `Q${i + 1}: ${r.question}\nA${i + 1}: ${r.answer}`)
    .join("\n\n");
}

// ─── Members (แท็บรายชื่อ) ────────────────────────────────
export async function getMembers(): Promise<MemberRow[]> {
  const now = Date.now();
  if (memberCache && now - memberCache.fetchedAt < CACHE_TTL)
    return memberCache.data;
  const url = process.env.SHEET_MEMBER_URL;
  if (!url) {
    console.warn("[sheet] SHEET_MEMBER_URL not set");
    return memberCache?.data ?? [];
  }
  try {
    const rows = await fetchCsv(url);
    // header: รหัส | ชื่อ | ตารางราคา
    const data = rows.slice(1).map((cols) => ({
      code: cols[0] ?? "",
      name: cols[1] ?? "",
      tier: (cols[2]?.toUpperCase() === "B2C" ? "B2C" : "B2B") as "B2B" | "B2C",
    })).filter((r) => r.code);
    memberCache = { data, fetchedAt: now };
    console.log(`[sheet] Members: ${data.length} rows`);
    return data;
  } catch (err) {
    console.error("[sheet] Members fetch failed:", err);
    return memberCache?.data ?? [];
  }
}

export function findMember(
  members: MemberRow[],
  code: string
): MemberRow | null {
  return (
    members.find(
      (m) => m.code.trim().toLowerCase() === code.trim().toLowerCase()
    ) ?? null
  );
}

// ─── Prices (แท็บตารางราคา) ──────────────────────────────
export async function getPrices(): Promise<PriceRow[]> {
  const now = Date.now();
  if (priceCache && now - priceCache.fetchedAt < CACHE_TTL)
    return priceCache.data;
  const url = process.env.SHEET_PRICE_URL;
  if (!url) {
    console.warn("[sheet] SHEET_PRICE_URL not set");
    return priceCache?.data ?? [];
  }
  try {
    const rows = await fetchCsv(url);
    // header: ลำดับ | ชื่อสินค้า | B2B | B2c | จำนวนในคลัง | ลูกค้าจอง | เหลือ
    const data = rows.slice(1).map((cols) => ({
      id: cols[0] ?? "",
      product: cols[1] ?? "",
      b2b: toNum(cols[2] ?? ""),
      b2c: toNum(cols[3] ?? ""),
      stock: toNum(cols[4] ?? ""),
      reserved: toNum(cols[5] ?? ""),
      remaining: toNum(cols[6] ?? ""),
    })).filter((r) => r.product);
    priceCache = { data, fetchedAt: now };
    console.log(`[sheet] Prices: ${data.length} rows`);
    return data;
  } catch (err) {
    console.error("[sheet] Prices fetch failed:", err);
    return priceCache?.data ?? [];
  }
}

export function pricesToText(
  prices: PriceRow[],
  tier: "B2B" | "B2C"
): string {
  if (!prices.length) return "(ไม่มีข้อมูลราคา)";
  return prices
    .map((r) => {
      const price = tier === "B2B" ? r.b2b : r.b2c;
      const stockInfo = r.remaining > 0 ? `มีสต็อก ${r.remaining} ชิ้น` : "สินค้าหมด";
      return `${r.product}: ราคา ${price.toLocaleString()} บาท (${stockInfo})`;
    })
    .join("\n");
}

// ─── Packages (แท็บแพ็คเกจ) ──────────────────────────────
export async function getPackages(): Promise<PackageRow[]> {
  const now = Date.now();
  if (packageCache && now - packageCache.fetchedAt < CACHE_TTL)
    return packageCache.data;
  const url = process.env.SHEET_PACKAGE_URL;
  if (!url) {
    console.warn("[sheet] SHEET_PACKAGE_URL not set");
    return packageCache?.data ?? [];
  }
  try {
    const rows = await fetchCsv(url);
    // header: เฟส | ชื่อ | inverter | แผง | แบตเตอรี่ | ราคา | หมายเหตุ
    const data = rows.slice(1).map((cols) => ({
      phase: cols[0]?.trim() ?? "",
      name: cols[1]?.trim() ?? "",
      inverter: cols[2]?.trim() ?? "",
      panel: cols[3]?.trim() ?? "",
      battery: cols[4]?.trim() ?? "",
      price: toNum(cols[5] ?? ""),
      note: cols[6]?.trim() ?? "",
    })).filter((r) => r.name);
    packageCache = { data, fetchedAt: now };
    console.log(`[sheet] Packages: ${data.length} rows`);
    return data;
  } catch (err) {
    console.error("[sheet] Packages fetch failed:", err);
    return packageCache?.data ?? [];
  }
}
