# LINE Bot Worker

LINE 官方帳號多使用者互動：查股票（收盤價+均線交叉狀態）、追蹤/取消追蹤股票、每日自動推播。
可分享給多人加好友使用，每人追蹤清單各自獨立，推播也只發給各自訂閱的人。

## 架構

- Cloudflare Workers：接收 LINE Webhook，即時呼叫 FinMind API 查詢
- Cloudflare KV（`WATCHLIST_KV`）：
  - key `users`：已互動過的 LINE userId 清單
  - key `watchlist:<userId>`：該使用者的追蹤清單（JSON 陣列）
- Cron Trigger（`10 6 * * 1-5`，台灣時間週一到五 14:10）：`scheduled` 函式逐一檢查每位使用者的追蹤清單，均線交叉時各自推播

## 指令

| 打字內容 | 功能 |
|---|---|
| `2330`（股票代號） | 查最新收盤價、漲跌、5日/20日均線交叉狀態 |
| `追蹤 2454` | 新增追蹤 |
| `取消追蹤 2454` | 移除追蹤 |
| `清單` | 看目前追蹤清單 |

加好友時會自動註冊使用者，收到歡迎訊息。

## 部署

```bash
cd line-bot-worker
npx wrangler deploy
```

需要先設定 Secrets（僅需設定一次）：

```bash
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put LINE_CHANNEL_SECRET
```

部署後把網址填回 LINE Developers Console 的 Messaging API → Webhook URL。
