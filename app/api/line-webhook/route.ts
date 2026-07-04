// app/api/line-webhook/route.ts
// LINE Webhook หลัก — routing ตาม keyword + member state

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { messagingApi, validateSignature, webhook } from "@line/bot-sdk";
import { getFaq } from "@/lib/sheet";
import { askGemini } from "@/lib/gemini";
import { getState, setState, clearState } from "@/lib/state";
import { buildContactMessage } from "@/lib/contact";
import { buildPackageCarousel } from "@/lib/packages";
import {
  buildAskCodeMessage,
  handleCodeInput,
  handleMemberMessage,
} from "@/lib/member";

const DEFAULT_REPLY = "เดี๋ยวให้เจ้าหน้าที่ติดต่อกลับนะคะ";

const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
});

// ─── แจ้ง admin เมื่อบอทตอบไม่ได้ ──────────────────────────
async function notifyAdmin(userMessage: string): Promise<void> {
  const adminId = process.env.LINE_ADMIN_USER_ID;
  if (!adminId) return;
  try {
    await lineClient.pushMessage({
      to: adminId,
      messages: [
        {
          type: "text",
          text: `แจ้งเตือน: บอทตอบไม่ได้\n\nคำถาม: "${userMessage}"\n\nกรุณาติดต่อกลับลูกค้าด้วยนะคะ`,
        },
      ],
    });
  } catch (err) {
    console.error("[notify] push failed:", err);
  }
}

// ─── ตรวจจับ keyword จาก Rich Menu ─────────────────────────
function detectKeyword(
  text: string
): "contact" | "phase1" | "phase3" | "about" | "member" | "cancel_member" | null {
  const t = text.trim().toLowerCase();
  if (t === "#ติดต่อ" || t === "ติดต่อเจ้าหน้าที่" || t === "ติดต่อ") return "contact";
  if (t === "#งาน1เฟส" || t === "งาน 1 เฟส" || t === "เซตไฟ 1 เฟส") return "phase1";
  if (t === "#งาน3เฟส" || t === "งาน 3 เฟส" || t === "เซตไฟ 3 เฟส") return "phase3";
  if (t === "#เกี่ยวกับเรา" || t === "เกี่ยวกับเรา") return "about";
  if (t === "#สมาชิก" || t === "สมาชิก") return "member";
  if (t === "ออกจากระบบ" || t === "logout") return "cancel_member";
  return null;
}

// ─── POST Handler ────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";
  const secret = process.env.LINE_CHANNEL_SECRET ?? "";

  if (!validateSignature(rawBody, secret, signature)) {
    console.warn("[webhook] invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: { events: webhook.Event[] };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await Promise.all(body.events.map(handleEvent));
  return NextResponse.json({ status: "ok" });
}

// ─── Event Handler ───────────────────────────────────────────
async function handleEvent(event: webhook.Event): Promise<void> {
  if (event.type !== "message") return;
  const msgEvent = event as webhook.MessageEvent;
  if (msgEvent.message.type !== "text") return;

  const replyToken = msgEvent.replyToken;
  if (!replyToken) return;

  const userId =
    (msgEvent.source as webhook.UserSource)?.userId ?? "unknown";
  const userMessage = (
    msgEvent.message as webhook.TextMessageContent
  ).text.trim();

  console.log(`[webhook] userId=${userId} msg=${userMessage}`);

  let replyMessages: messagingApi.Message[] = [];

  // ─── ตรวจสอบ keyword ──────────────────────────────────────
  const keyword = detectKeyword(userMessage);

  if (keyword === "contact") {
    replyMessages = [buildContactMessage()];
  } else if (keyword === "phase1") {
    const card = await buildPackageCarousel("1");
    replyMessages = [card];
  } else if (keyword === "phase3") {
    const card = await buildPackageCarousel("3");
    replyMessages = [card];
  } else if (keyword === "about") {
    replyMessages = [
      {
        type: "text",
        text: "Solis Energy & Smart Solutions\nผู้เชี่ยวชาญติดตั้งระบบ Solar ภาคเหนือ ประสบการณ์กว่า 10 ปี\nจำหน่ายและติดตั้ง Inverter Sigen ทุกรุ่น\n\nเว็บไซต์: (กำลังเปิดตัวเร็วๆ นี้)\nโทร: 065-253-9993\nเปิดทุกวัน 08:00–17:00 น.",
      },
    ];
  } else if (keyword === "member") {
    // เริ่ม member flow
    await setState(userId, { step: "awaiting_code" });
    replyMessages = [buildAskCodeMessage()];
  } else if (keyword === "cancel_member") {
    // ออกจากระบบจาก keyword ตรงๆ
    await clearState(userId);
    replyMessages = [
      {
        type: "text",
        text: "ออกจากระบบสมาชิกแล้วนะคะ ขอบคุณที่ใช้บริการคะ",
      },
    ];
  } else {
    // ─── ตรวจสอบ state ของ user ────────────────────────────
    const state = await getState(userId);

    if (state.step === "awaiting_code") {
      // กำลังรอรหัสสมาชิก
      const reply = await handleCodeInput(userId, userMessage);
      replyMessages = [reply];
    } else if (state.step === "member_active") {
      // สมาชิก active — route ไป member handler
      const reply = await handleMemberMessage(userId, state, userMessage);
      replyMessages = [reply];
    } else {
      // ─── FAQ / Gemini ─────────────────────────────────────
      const faq = await getFaq();
      const replyText = await askGemini(userMessage, faq);

      if (replyText === DEFAULT_REPLY) {
        notifyAdmin(userMessage); // fire and forget
      }

      replyMessages = [{ type: "text", text: replyText }];
    }
  }

  // ─── ส่ง reply ───────────────────────────────────────────
  try {
    await lineClient.replyMessage({
      replyToken,
      messages: replyMessages,
    });
    console.log(`[webhook] replied with ${replyMessages.length} message(s)`);
  } catch (err) {
    console.error("[webhook] reply failed:", err);
  }
}

// ─── GET (health check) ───────────────────────────────────
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: "LINE webhook is running" });
}
