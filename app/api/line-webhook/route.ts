// app/api/line-webhook/route.ts
// LINE Webhook endpoint — verify signature → ดึง FAQ → เรียก Gemini → reply

import { NextRequest, NextResponse } from "next/server";
import { messagingApi, validateSignature, webhook } from "@line/bot-sdk";
import { getFaq } from "@/lib/sheet";
import { askGemini } from "@/lib/gemini";

const DEFAULT_REPLY = "เดี๋ยวให้เจ้าหน้าที่ติดต่อกลับนะคะ";

// LINE client สำหรับส่ง reply
const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
});

// LINE webhook ส่ง POST เสมอ
export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. อ่าน raw body สำหรับ verify signature
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";
  const secret = process.env.LINE_CHANNEL_SECRET ?? "";

  // 2. ตรวจสอบว่า request มาจาก LINE จริง
  if (!validateSignature(rawBody, secret, signature)) {
    console.warn("[webhook] invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 3. parse body
  let body: { events: webhook.Event[] };
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.error("[webhook] invalid JSON");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 4. handle events ทั้งหมด
  await Promise.all(body.events.map((event) => handleEvent(event)));

  return NextResponse.json({ status: "ok" });
}

async function handleEvent(event: webhook.Event): Promise<void> {
  // รับเฉพาะ text message event
  if (event.type !== "message") return;

  const msgEvent = event as webhook.MessageEvent;
  if (msgEvent.message.type !== "text") return;

  const replyToken = msgEvent.replyToken;
  const userMessage = (msgEvent.message as webhook.TextMessageContent).text;

  console.log(`[webhook] user: ${userMessage}`);

  // 5. ดึง FAQ (จาก cache หรือ fetch ใหม่)
  const faq = await getFaq();

  // 6. เรียก Gemini
  const replyText = await askGemini(userMessage, faq);

  // 7. ส่ง reply กลับ LINE
  try {
    await lineClient.replyMessage({
      replyToken,
      messages: [{ type: "text", text: replyText }],
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
