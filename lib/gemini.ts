// lib/gemini.ts
// เรียก Gemini และจัดการ token / finishReason

import { GoogleGenAI } from "@google/genai";
import { faqToText, FaqRow } from "./sheet";

const DEFAULT_REPLY = "เดี๋ยวให้เจ้าหน้าที่ติดต่อกลับนะคะ";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

function buildSystemPrompt(faqText: string): string {
  return `<role>
คุณคือน้องโซลิส พนักงานของ Solis Energy & Smart Solutions ผู้เชี่ยวชาญด้านระบบ Solar และ Inverter Sigen
</role>

<constraints>
- ตอบโดยใช้ข้อมูลใน <faq> เท่านั้น
- ห้ามแต่งราคา ระยะเวลา หรือข้อมูลที่ไม่มีใน FAQ
- ถ้าไม่มีข้อมูลตอบ ให้ตอบว่า "${DEFAULT_REPLY}"
- ใช้โทนสุภาพ เป็นมืออาชีพ ไม่ใช้ emoji
- ตอบภาษาไทย ความยาว 1-3 ประโยค
- ถ้าลูกค้าถามสินค้าที่มีหลายรุ่นย่อย (เช่น EC 10.0 มีทั้ง SP และ TP) ให้แสดงราคาทุกรุ่นที่มีใน FAQ พร้อมกันใน 1 ข้อความเลย ไม่ต้องถามให้ลูกค้าระบุรุ่นก่อน
- ราคาในระบบเป็นตัวเลข ให้แสดงในรูปแบบ "ราคา XX,XXX บาท" เสมอ
- "5k" หรือ "5kW" หมายถึงสินค้าที่มี 5.0 ในชื่อ, "10k" หรือ "10kW" = 10.0, "20k" = 20.0, "25k" = 25.0
</constraints>

<output_format>
ภาษาไทย ไม่ใช้ markdown ไม่ใช้ bullet point
</output_format>

<faq>
${faqText}
</faq>`;
}

/**
 * เรียก Gemini ด้วย FAQ + user message
 * คืน reply text หรือ DEFAULT_REPLY ถ้าเกิด error / MAX_TOKENS
 */
export async function askGemini(
  userMessage: string,
  faq: FaqRow[]
): Promise<string> {
  const faqText = faqToText(faq);
  const systemPrompt = buildSystemPrompt(faqText);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `<question>\n${userMessage}\n</question>`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: systemPrompt,
        temperature: 1.0,
        maxOutputTokens: 1024,
      },
    });

    // ดึง metadata สำหรับ debug
    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason ?? "UNKNOWN";
    const thoughtsTokenCount =
      response.usageMetadata?.thoughtsTokenCount ?? 0;
    const candidatesTokenCount =
      response.usageMetadata?.candidatesTokenCount ?? 0;

    console.log(
      `[gemini] finishReason=${finishReason} ` +
        `thoughtsTokens=${thoughtsTokenCount} ` +
        `candidatesTokens=${candidatesTokenCount}`
    );

    // ถ้าตัดกลางประโยค → ส่ง default แทน
    if (finishReason === "MAX_TOKENS") {
      console.warn("[gemini] MAX_TOKENS reached — returning default reply");
      return DEFAULT_REPLY;
    }

    const text = candidate?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      console.warn("[gemini] empty response");
      return DEFAULT_REPLY;
    }

    return text;
  } catch (err) {
    console.error("[gemini] error:", err);
    return DEFAULT_REPLY;
  }
}
