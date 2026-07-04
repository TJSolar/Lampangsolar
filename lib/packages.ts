// lib/packages.ts
// สร้าง Flex Message carousel สำหรับแพ็คเกจ Solar

import { messagingApi } from "@line/bot-sdk";
import { PackageRow, getPackages } from "./sheet";

const HEADER_COLORS: Record<string, string> = {
  "1": "#1a6b3c",
  "3": "#1a4a7a",
};

function buildPackageBubble(pkg: PackageRow): messagingApi.FlexBubble {
  const color = HEADER_COLORS[pkg.phase] ?? "#1a6b3c";
  const phaseLabel = pkg.phase === "1" ? "1 เฟส" : "3 เฟส";
  const priceText = pkg.price > 0
    ? `฿${pkg.price.toLocaleString()}`
    : "ติดต่อสอบถาม";

  const specItems: messagingApi.FlexComponent[] = [];
  if (pkg.inverter) {
    specItems.push({
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      contents: [
        { type: "text", text: "⚡", size: "xs", flex: 0 },
        { type: "text", text: pkg.inverter, size: "xs", color: "#555555", wrap: true },
      ],
    } as messagingApi.FlexBox);
  }
  if (pkg.panel) {
    specItems.push({
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      contents: [
        { type: "text", text: "🔆", size: "xs", flex: 0 },
        { type: "text", text: pkg.panel, size: "xs", color: "#555555", wrap: true },
      ],
    } as messagingApi.FlexBox);
  }
  if (pkg.battery) {
    specItems.push({
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      contents: [
        { type: "text", text: "🔋", size: "xs", flex: 0 },
        { type: "text", text: pkg.battery, size: "xs", color: "#555555", wrap: true },
      ],
    } as messagingApi.FlexBox);
  }

  return {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: phaseLabel,
          size: "xs",
          color: "#ccffcc",
          weight: "bold",
        },
        {
          type: "text",
          text: pkg.name,
          size: "md",
          color: "#ffffff",
          weight: "bold",
          wrap: true,
        },
      ],
      backgroundColor: color,
      paddingAll: "14px",
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        ...specItems,
        { type: "separator", margin: "sm" },
        {
          type: "text",
          text: "ราคาพร้อมติดตั้ง",
          size: "xs",
          color: "#888888",
          margin: "sm",
        },
        {
          type: "text",
          text: priceText,
          size: "xl",
          weight: "bold",
          color: color,
        },
        ...(pkg.note
          ? [
              {
                type: "text",
                text: pkg.note,
                size: "xxs",
                color: "#aaaaaa",
                wrap: true,
              } as messagingApi.FlexText,
            ]
          : []),
      ],
      paddingAll: "14px",
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          action: {
            type: "message",
            label: "สนใจแพ็คเกจนี้",
            text: `สนใจ: ${pkg.name}`,
          },
          style: "primary",
          color: color,
          height: "sm",
        },
      ],
      paddingAll: "10px",
    },
  };
}

export async function buildPackageCarousel(
  phase: "1" | "3"
): Promise<messagingApi.FlexMessage | messagingApi.TextMessage> {
  const allPackages = await getPackages();
  const filtered = allPackages.filter((p) => p.phase === phase);

  if (!filtered.length) {
    return {
      type: "text",
      text: phase === "1"
        ? "กำลังเตรียมข้อมูลแพ็คเกจ 1 เฟสอยู่นะคะ สอบถามเพิ่มเติมได้ที่ 065-253-9993 คะ"
        : "กำลังเตรียมข้อมูลแพ็คเกจ 3 เฟสอยู่นะคะ สอบถามเพิ่มเติมได้ที่ 065-253-9993 คะ",
    };
  }

  // LINE carousel รองรับสูงสุด 12 bubbles
  const bubbles = filtered.slice(0, 12).map(buildPackageBubble);

  if (bubbles.length === 1) {
    return {
      type: "flex",
      altText: `แพ็คเกจ Solar ${phase} เฟส`,
      contents: bubbles[0],
    };
  }

  return {
    type: "flex",
    altText: `แพ็คเกจ Solar ${phase} เฟส`,
    contents: {
      type: "carousel",
      contents: bubbles,
    },
  };
}
