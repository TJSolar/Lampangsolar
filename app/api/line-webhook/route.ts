// app/api/line-webhook/route.ts
// LINE Webhook endpoint — verify signature → ดึง FAQ → เรียก Gemini → reply

import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { messagingApi, WebhookEvent, MessageEvent, TextMessage } from "@line/bot-sdk";
import { getFaq } from "@/lib/sheet";
import { askGemini } from "@/lib/gemini";

const DEFAULT_REPLY = "เดี๋ยวให้เจ้าหน้าที่ติดต่อกลับนะคะ";

// LINE client — ใช้สำหรับ reply เท่านั้น
const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
});

/**
 * ตรวจสอบ LINE signature
 * https://developers.line.biz/en/docs/messaging-api/receiving-messages/#verify-signature
 */
function verifySignature(body: string, signature: string): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET ?? "";
  const hash = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64");
  return hash === signature;
}

// LINE webhook ส่ง POST เสมอ
export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. อ่าน raw body สำหรับ verify signature
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";

  if (!verifySignature(rawBody, signature)) {
    console.warn("[webhook] invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. parse body
  let body: { events: WebhookEvent[] };
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.error("[webhook] invalid JSON");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 3. handle events แบบ non-blocking (ตอบ LINE ว่า 200 ก่อน แล้วค่อยประมวลผล)
  // แต่เนื่องจาก Vercel Serverless ต้องรอให้เสร็จก่อน return จึง await ที่นี่
  // และต้องให้เสร็จภายใน 10 วินาที (LINE timeout)
  await Promise.all(
    body.events.map((event) => handleEvent(event))
  );

  return NextResponse.json({ status: "ok" });
}

async function handleEvent(event: WebhookEvent): Promise<void> {
  // รับเฉพาะ text message event
  if (event.type !== "message" || event.message.type !== "text") {
    return;
  }

  const messageEvent = event as MessageEvent;
  const replyToken = messageEvent.replyToken;
  const userMessage = (messageEvent.message as TextMessage).text;

  console.log(`[webhook] user: ${userMessage}`);

  // 4. ดึง FAQ (จาก cache หรือ fetch ใหม่)
  const faq = await getFaq();

  // 5. เรียก Gemini
  const replyText = await askGemini(userMessage, faq);

  // 6. ส่ง reply กลับ LINE
  try {
    await lineClient.replyMessage({
      replyToken,
      messages: [
        {
          type: "text",
          text: replyText,
        },
      ],
    });
    console.log(`[webhook] replied: ${replyText}`);
  } catch (err) {
    // log แต่ไม่ throw — กัน LINE retry loop
    console.error("[webhook] reply failed:", err);
  }
}

// LINE ส่ง GET สำหรับ verify webhook URL
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: "LINE webhook is running" });
}
