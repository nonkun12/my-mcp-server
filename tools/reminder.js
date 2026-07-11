import { z } from "zod";
import db from "../database.js";

// =================================
// reminder系ツールの登録
// =================================
// set_reminder: 指定した日時にユーザーへ送るメッセージを予約する。
// 実際の送信はindex.js内のスケジューラー(setInterval)が定期的にこのテーブルを見て行う。
export function registerReminderTools(server) {

  server.registerTool(

    "set_reminder",

    {
      title: "Set Reminder",

      description:
        "指定した日時にユーザーへリマインドメッセージを送るよう予約します。" +
        "remind_atはISO 8601形式の日時文字列(例: 2026-07-12T15:00:00+09:00)で指定してください。",

      inputSchema: {

        user_id: z.string().describe("リマインド対象のユーザーID"),

        remind_at: z.string().describe("ISO 8601形式の日時(タイムゾーン付き推奨)"),

        message: z.string().describe("リマインド時に送る内容")

      }

    },

    async ({ user_id, remind_at, message }) => {

      try {

        const parsed = new Date(remind_at);

        if (isNaN(parsed.getTime())) {
          return {
            content: [
              {
                type: "text",
                text: `日時の形式が正しくありません: ${remind_at}`
              }
            ]
          };
        }

        db.prepare(`
          INSERT INTO reminders(user_id, remind_at, message, sent)
          VALUES (?, ?, ?, 0)
        `).run(user_id, parsed.toISOString(), message);

        return {
          content: [
            {
              type: "text",
              text: `リマインダーを登録しました: ${parsed.toISOString()} に「${message}」`
            }
          ]
        };

      } catch (error) {

        return {
          content: [
            {
              type: "text",
              text: "登録エラー: " + error.message
            }
          ]
        };

      }

    }

  );

}