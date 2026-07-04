// lib/member.ts
// จัดการ flow สมาชิก B2B/B2C

import { messagingApi } from "@line/bot-sdk";
import { getMembers, findMember, getPrices, pricesToText, getFaq, faqToText } from "./sheet";
import { getState, setState, clearState, UserState } from "./state";
import { askGemini } from "./gemini";

const DEFAULT_REPLY = "เดี๋ยวให้เจ้าหน้าที่ติดต่อกลับนะคะ";

// ─── เริ่ม flow สมาชิก ─────────────────────────────────────
export function buildAskCodeMessage(): messagingApi.TextMessage {
  return {
    type: "text",
    text: "ยินดีต้อนรับสู่ระบบสมาชิกนะคะ\n\nกรุณาพิมพ์รหัสสมาชิกของท่านได้เลยคะ",
  };
}

// ─── ตรวจสอบรหัสสมาชิก ────────────────────────────────────
export async function handleCodeInput(
  userId: string,
  code: string
): Promise<messagingApi.Message> {
  const members = await getMembers();
  const member = findMember(members, code);

  if (!member) {
    return {
      type: "text",
      text: "ไม่พบรหัสสมาชิกนะคะ กรุณาตรวจสอบอีกครั้ง หรือติดต่อเจ้าหน้าที่ที่ 065-253-9993 คะ",
    };
  }

  // บันทึก state
  await setState(userId, {
    step: "member_active",
    memberCode: member.code,
    memberName: member.name,
    tier: member.tier,
  });

  const tierLabel = member.tier === "B2B" ? "B2B (ร้านค้า/EPC)" : "B2C (ลูกค้าทั่วไป)";

  return {
    type: "text",
    text: `สวัสดีคุณ${member.name} ยินดีต้อนรับนะคะ\nระดับ: ${tierLabel}\n\nสามารถพิมพ์ชื่อสินค้าที่สนใจได้เลยคะ หรือพิมพ์ "ราคาทั้งหมด" เพื่อดูรายการราคาคะ\n\nพิมพ์ "ออกจากระบบ" เมื่อต้องการออกนะคะ`,
  };
}

// ─── ตอบกลับเมื่อ member active ────────────────────────────
export async function handleMemberMessage(
  userId: string,
  state: UserState,
  userMessage: string
): Promise<messagingApi.Message> {
  const msg = userMessage.trim().toLowerCase();

  // ออกจากระบบ
  if (msg === "ออกจากระบบ" || msg === "logout" || msg === "exit") {
    await clearState(userId);
    return {
      type: "text",
      text: `ขอบคุณคุณ${state.memberName} ที่ใช้บริการนะคะ หากมีคำถามสามารถติดต่อกลับได้เสมอคะ`,
    };
  }

  // ดูราคาทั้งหมด
  if (msg === "ราคาทั้งหมด" || msg === "ดูราคา" || msg === "รายการราคา") {
    const prices = await getPrices();
    if (!prices.length) {
      return { type: "text", text: "ไม่พบข้อมูลราคาขณะนี้คะ กรุณาติดต่อทีมงานนะคะ" };
    }
    const tier = state.tier ?? "B2B";
    const text = pricesToText(prices, tier);
    return {
      type: "text",
      text: `รายการราคาสำหรับคุณ${state.memberName} (${tier})\n\n${text}`,
    };
  }

  // สั่งสินค้า
  if (msg.startsWith("สั่ง ") || msg.startsWith("order ")) {
    const detail = userMessage.replace(/^(สั่ง|order)\s+/i, "").trim();
    return {
      type: "text",
      text: `รับทราบคะ ขอ order: ${detail}\n\nทีมเราจะติดต่อกลับเพื่อยืนยันรายการและนัดส่งสินค้านะคะ\nสอบถามด่วน: 065-253-9993`,
    };
  }

  // ถามราคาสินค้าผ่าน Gemini + ราคา member
  const prices = await getPrices();
  const tier = state.tier ?? "B2B";
  const priceText = pricesToText(prices, tier);
  const faq = await getFaq();
  const faqText = faqToText(faq);

  const memberContext = `ลูกค้าคนนี้คือสมาชิก ${tier} ชื่อ ${state.memberName} — ให้ใช้ราคา ${tier} จากตารางด้านล่างในการตอบ\n\n<member_prices>\n${priceText}\n</member_prices>\n\n<faq>\n${faqText}\n</faq>`;

  const replyText = await askGemini(userMessage, faq, memberContext);

  return { type: "text", text: replyText };
}
