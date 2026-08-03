# LINE Bot Worker

LINE 官方帳號打字互動：查股票（收盤價+均線交叉狀態）、追蹤/取消追蹤股票。

## 架構

- Cloudflare Workers：接收 LINE Webhook，即時呼叫 FinMind API 查詢
- Cloudflare KV（`WATCHLIST_KV`）：存追蹤清單，key 固定為 `watchlist`

## 指令

| 打字內容 | 功能 |
|---|---|
| `2330`（股票代號） | 查最新收盤價、漲跌、5日/20日均線交叉狀態 |
| `追蹤 2454` | 新增追蹤 |
| `取消追蹤 2454` | 移除追蹤 |
| `清單` | 看目前追蹤清單 |

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
