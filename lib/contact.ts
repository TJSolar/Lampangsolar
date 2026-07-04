// lib/contact.ts
// สร้าง Flex Message ข้อมูลการติดต่อ

import { messagingApi } from "@line/bot-sdk";

export function buildContactMessage(): messagingApi.FlexMessage {
  return {
    type: "flex",
    altText: "ข้อมูลการติดต่อ Solis Energy & Smart Solutions",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "Solis Energy & Smart Solutions",
            weight: "bold",
            color: "#ffffff",
            size: "md",
          },
          {
            type: "text",
            text: "ผู้เชี่ยวชาญระบบ Solar ภาคเหนือ",
            color: "#ddffdd",
            size: "sm",
          },
        ],
        backgroundColor: "#1a6b3c",
        paddingAll: "16px",
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
              { type: "text", text: "📞", size: "sm", flex: 0 },
              {
                type: "text",
                text: "065-253-9993",
                size: "sm",
                color: "#333333",
                action: {
                  type: "uri",
                  label: "โทร",
                  uri: "tel:0652539993",
                },
              },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
              { type: "text", text: "💬", size: "sm", flex: 0 },
              {
                type: "text",
                text: "LINE: tjsolar78",
                size: "sm",
                color: "#333333",
                action: {
                  type: "uri",
                  label: "LINE",
                  uri: "https://line.me/ti/p/~tjsolar78",
                },
              },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
              { type: "text", text: "🕐", size: "sm", flex: 0 },
              {
                type: "text",
                text: "เปิดทุกวัน 08:00 – 17:00 น.",
                size: "sm",
                color: "#333333",
              },
            ],
          },
        ],
        paddingAll: "16px",
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            action: {
              type: "uri",
              label: "ดูแผนที่บริษัท",
              uri: "https://maps.app.goo.gl/jHcfhJy3wySbToWv8",
            },
            style: "primary",
            color: "#1a6b3c",
            height: "sm",
          },
          {
            type: "button",
            action: {
              type: "uri",
              label: "โทรหาเรา",
              uri: "tel:0652539993",
            },
            style: "secondary",
            height: "sm",
          },
        ],
        paddingAll: "12px",
      },
    },
  };
}
