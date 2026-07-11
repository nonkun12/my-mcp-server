import { z } from "zod";
import db from "../database.js";

// =================================
// reminder系ツールの登録
// =================================
// set_reminder: 指定した日時にユーザーへ送るメッセージを予約する。
// 実際の送信はindex.js内のスケジューラー(setInterval)が定期的にこのテーブルを見て行う。
//
// list_reminders: そのユーザーの「まだ送信されていない」リマインダー一覧を返す。
// ユーザーが「今何がセットされてる?」と聞いたときに使う。
//
// cancel_reminder: list_remindersで見せたidを指定して、そのリマインダーを削除する。
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


  server.registerTool(

    "list_reminders",

    {
      title: "List Reminders",

      description:
        "そのユーザーの、まだ送信されていない(予定されている)リマインダーを一覧で返します。" +
        "ユーザーが「今何がセットされてる?」「リマインダー一覧」のように聞いてきたときに使ってください。",

      inputSchema: {

        user_id: z.string().describe("対象ユーザーのID")

      }

    },

    async ({ user_id }) => {

      try {

        const rows = db.prepare(`
          SELECT id, remind_at, message
          FROM reminders
          WHERE user_id = ? AND sent = 0
          ORDER BY remind_at ASC
        `).all(user_id);

        if (rows.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "予定されているリマインダーはありません"
              }
            ]
          };
        }

        const lines = rows.map(
          (r) => `id=${r.id}: ${r.remind_at} に「${r.message}」`
        );

        return {
          content: [
            {
              type: "text",
              text: lines.join("\n")
            }
          ]
        };

      } catch (error) {

        return {
          content: [
            {
              type: "text",
              text: "取得エラー: " + error.message
            }
          ]
        };

      }

    }

  );


  server.registerTool(

    "cancel_reminder",

    {
      title: "Cancel Reminder",

      description:
        "指定したidのリマインダーをキャンセル(削除)します。" +
        "idは list_reminders で確認したものを使ってください。" +
        "他のユーザーのリマインダーは削除できないよう、user_idと一致するもののみ削除します。",

      inputSchema: {

        user_id: z.string().describe("対象ユーザーのID"),

        id: z.number().describe("キャンセルしたいリマインダーのid(list_remindersで確認)")

      }

    },

    async ({ user_id, id }) => {

      try {

        const result = db.prepare(`
          DELETE FROM reminders
          WHERE id = ? AND user_id = ? AND sent = 0
        `).run(id, user_id);

        if (result.changes === 0) {
          return {
            content: [
              {
                type: "text",
                text: `id=${id} のリマインダーが見つかりませんでした(既に送信済み、または存在しません)`
              }
            ]
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `id=${id} のリマインダーをキャンセルしました`
            }
          ]
        };

      } catch (error) {

        return {
          content: [
            {
              type: "text",
              text: "キャンセルエラー: " + error.message
            }
          ]
        };

      }

    }

  );

}