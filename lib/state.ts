// lib/state.ts
// จัดการ session state ของแต่ละ user ผ่าน Upstash Redis REST API
// ไม่ต้องติดตั้ง package เพิ่ม — ใช้ native fetch

export type UserStep = "idle" | "awaiting_code" | "member_active";

export interface CartItem {
  product: string;
  qty: number;
  unitPrice: number;
}

export interface UserState {
  step: UserStep;
  memberCode?: string;
  memberName?: string;
  tier?: "B2B" | "B2C";
  cart?: CartItem[];
}

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL ?? "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
const TTL = 30 * 60; // 30 นาที

async function redis(command: unknown[]): Promise<unknown> {
  if (!REDIS_URL || !REDIS_TOKEN) {
    console.warn("[state] Upstash not configured");
    return null;
  }
  try {
    const res = await fetch(REDIS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      cache: "no-store",
    });
    const data = (await res.json()) as { result: unknown };
    return data.result;
  } catch (err) {
    console.error("[state] redis error:", err);
    return null;
  }
}

export async function getState(userId: string): Promise<UserState> {
  const result = await redis(["GET", `solis:${userId}`]);
  if (!result || typeof result !== "string") return { step: "idle" };
  try {
    return JSON.parse(result) as UserState;
  } catch {
    return { step: "idle" };
  }
}

export async function setState(
  userId: string,
  state: UserState
): Promise<void> {
  await redis(["SET", `solis:${userId}`, JSON.stringify(state), "EX", TTL]);
}

export async function clearState(userId: string): Promise<void> {
  await redis(["DEL", `solis:${userId}`]);
}
