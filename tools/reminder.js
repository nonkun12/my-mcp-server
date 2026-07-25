import { z } from "zod";
import pool from "../database.js";

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
//
// get_today_schedule: AI秘書の「今日の予定確認」専用。sent=true/falseの両方を含め、
// JST基準で「今日」の分だけを取得する(list_remindersとは用途が異なるため分離)。
export function registerReminderTools(server) {
  console.log("[LOG] registerReminderTools called");

  server.registerTool(
    "set_reminder",
    {
      title: "Set Reminder",
      description:
        "指定した日時にユーザーへリマインドメッセージを送るよう予約します。" +
        "remind_atはISO 8601形式の日時文字列(例: 2026-07-12T15:00:00+09:00)で指定してください。" +
        "ユーザーが「毎日」「毎朝」のように繰り返しを希望した場合は repeat='daily' を指定してください。" +
        "その場合、remind_atは1回目に送る日時(以降は毎日同じ時刻に自動継続)にしてください。",
      inputSchema: {
        user_id: z.string().describe("リマインド対象のユーザーID"),
        remind_at: z.string().describe("ISO 8601形式の日時(タイムゾーン付き推奨)"),
        message: z.string().describe("リマインド時に送る内容"),
        repeat: z
          .enum(["none", "daily"])
          .optional()
          .describe("繰り返しの種類。'daily'を指定すると毎日同じ時刻に繰り返す。指定がなければ単発(none)。")
      }
    },

    async ({ user_id, remind_at, message, repeat }) => {
      console.log(`[LOG] tool set_reminder invoked: user_id=${user_id}`);
      // 診断用: 重複呼び出しの有無を確認するため、呼ばれるたびに記録する
      console.error(`[TOOL CALL] set_reminder user_id=${user_id} remind_at=${remind_at} message=${message} repeat=${repeat}`);

      const repeatValue = repeat === "daily" ? "daily" : "none";

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

        await pool.query(
          `
          INSERT INTO reminders(user_id, remind_at, message, sent, repeat)
          VALUES ($1, $2, $3, false, $4)
          `,
          [user_id, parsed, message, repeatValue]
        );

        const repeatNote = repeatValue === "daily" ? "(毎日繰り返し)" : "";

        return {
          content: [
            {
              type: "text",
              text: `✅ ${parsed.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" })} に「${message}」を通知します${repeatNote}`
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
      console.log(`[LOG] tool list_reminders invoked: user_id=${user_id}`);
      console.error(`[TOOL CALL] list_reminders user_id=${user_id}`);

      try {
        const result = await pool.query(
          `
          SELECT id, remind_at, message, repeat
          FROM reminders
          WHERE user_id = $1 AND sent = false
          ORDER BY remind_at ASC
          `,
          [user_id]
        );

        if (result.rows.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "予定されているリマインダーはありません"
              }
            ]
          };
        }

        const lines = result.rows.map((r) => {
          const repeatNote = r.repeat === "daily" ? "(毎日繰り返し)" : "";
          return `id=${r.id}: ${r.remind_at.toISOString()} に「${r.message}」${repeatNote}`;
        });

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
      console.log(`[LOG] tool cancel_reminder invoked: user_id=${user_id}, id=${id}`);
      console.error(`[TOOL CALL] cancel_reminder user_id=${user_id} id=${id}`);

      try {
        const result = await pool.query(
          `
          DELETE FROM reminders
          WHERE id = $1 AND user_id = $2 AND sent = false
          `,
          [id, user_id]
        );

        console.error("DELETE ROW COUNT:", result.rowCount);

        if (result.rowCount === 0) {
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


  server.registerTool(
    "get_today_schedule",
    {
      title: "Get Today Schedule",
      description:
        "そのユーザーの「今日(JST基準)」分の予定を、送信済み(sent=true)・未送信(sent=false)の" +
        "両方を含めて時刻順で返します。list_remindersとは異なり通知スケジューラー用ではなく、" +
        "AI秘書が「今日の予定/リマインダーを教えて」と聞かれたときの確認用に使ってください。" +
        "今日より前の日付のものは含まれません。",
      inputSchema: {
        user_id: z.string().describe("対象ユーザーのID")
      }
    },

    async ({ user_id }) => {
      console.log(`[LOG] tool get_today_schedule invoked: user_id=${user_id}`);
      console.error(`[TOOL CALL] get_today_schedule user_id=${user_id}`);

      try {
        const result = await pool.query(
          `
          SELECT id, remind_at, message, repeat, sent
          FROM reminders
          WHERE user_id = $1
            AND (remind_at AT TIME ZONE 'Asia/Tokyo')::date
                = (NOW() AT TIME ZONE 'Asia/Tokyo')::date
          ORDER BY remind_at ASC
          `,
          [user_id]
        );

        const rows = result.rows.map((r) => ({
          id: r.id,
          remind_at: r.remind_at.toISOString(),
          message: r.message,
          repeat: r.repeat,
          sent: r.sent
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(rows)
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

}