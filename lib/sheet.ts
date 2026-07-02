// lib/sheet.ts
// ดึง FAQ จาก Google Sheet (CSV public URL) และ cache ใน memory 60 วินาที

export interface FaqRow {
  question: string;
  answer: string;
}

interface Cache {
  data: FaqRow[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 1000; // 60 วินาที
let cache: Cache | null = null;

/**
 * Parse CSV text เป็น array ของ FaqRow
 * รองรับ quote fields ที่มี comma ด้านใน
 */
function parseCsv(text: string): FaqRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  // ข้าม header row (บรรทัดแรก)
  const rows: FaqRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // split ด้วย comma ตัวแรกที่อยู่นอก quote
    const cols = splitCsvLine(line);
    if (cols.length >= 2) {
      rows.push({
        question: cols[0].trim(),
        answer: cols[1].trim(),
      });
    }
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // escaped quote ""
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * ดึง FAQ จาก Google Sheet
 * - ถ้า cache ยังไม่หมดอายุ → คืน cache
 * - ถ้า fetch ล้มเหลว → คืน cache เก่า (ถ้ามี) หรือ array ว่าง
 */
export async function getFaq(): Promise<FaqRow[]> {
  const now = Date.now();

  // คืน cache ถ้ายังไม่หมดอายุ
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  const url = process.env.SHEET_CSV_URL;
  if (!url) {
    console.error("[sheet] SHEET_CSV_URL not set");
    return cache?.data ?? [];
  }

  try {
    const res = await fetch(url, {
      // ไม่ cache ที่ Next.js layer — เราจัดการ cache เอง
      cache: "no-store",
      signal: AbortSignal.timeout(5000), // timeout 5 วินาที
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const text = await res.text();
    const data = parseCsv(text);

    cache = { data, fetchedAt: now };
    console.log(`[sheet] fetched ${data.length} FAQ rows`);
    return data;
  } catch (err) {
    console.error("[sheet] fetch failed:", err);
    // fallback: คืน cache เก่าถ้ามี
    return cache?.data ?? [];
  }
}

/**
 * แปลง FAQ array เป็น string สำหรับใส่ใน system prompt
 */
export function faqToText(faq: FaqRow[]): string {
  if (faq.length === 0) return "(ไม่มีข้อมูล FAQ)";
  return faq
    .map((row, i) => `Q${i + 1}: ${row.question}\nA${i + 1}: ${row.answer}`)
    .join("\n\n");
}
