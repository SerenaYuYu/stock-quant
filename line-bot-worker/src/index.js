// LINE Bot Webhook：查股票（收盤價+均線交叉）、追蹤/取消追蹤指令
// 多使用者：每個 LINE userId 各自的追蹤清單，各自收均線交叉推播
// 環境變數（Secrets）：LINE_CHANNEL_SECRET、LINE_CHANNEL_ACCESS_TOKEN
// KV binding：WATCHLIST_KV
//   - key "users"            存已互動過的 userId 陣列
//   - key "watchlist:<uid>"  存該使用者的追蹤清單（JSON 陣列）

const FAST_PERIOD = 5;
const SLOW_PERIOD = 20;

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    const bodyText = await request.text();
    const signature = request.headers.get("x-line-signature") || "";
    const valid = await verifySignature(bodyText, signature, env.LINE_CHANNEL_SECRET);
    if (!valid) {
      return new Response("Invalid signature", { status: 403 });
    }

    const body = JSON.parse(bodyText);
    for (const event of body.events || []) {
      const userId = event.source && event.source.userId;
      if (!userId) continue;

      await registerUser(env, userId);

      if (event.type === "message" && event.message.type === "text") {
        const replyText = await handleMessage(event.message.text.trim(), env, userId);
        if (replyText) {
          await replyToLine(event.replyToken, replyText, env);
        }
      } else if (event.type === "follow") {
        await replyToLine(
          event.replyToken,
          "歡迎使用股票通知機器人！\n打股票代號查詢，如「2330」\n「追蹤 2454」開始追蹤\n每日收盤後會自動通知你追蹤股票的均線交叉訊號",
          env
        );
      }
    }

    return new Response("OK", { status: 200 });
  },

  // Cron Trigger：每日排程，逐一檢查每個使用者的追蹤清單，有均線交叉訊號就推播
  async scheduled(controller, env) {
    const users = await getUsers(env);
    for (const userId of users) {
      const list = await getWatchlist(env, userId);
      if (list.length === 0) continue;

      const messages = [];
      for (const stockId of list) {
        const signal = await detectCrossSignal(stockId, env);
        if (signal === "buy") messages.push(`${stockId}：5日均線上穿20日均線，買進訊號`);
        else if (signal === "sell") messages.push(`${stockId}：5日均線下穿20日均線，賣出訊號`);
      }

      if (messages.length > 0) {
        await pushToLine(userId, messages.join("\n"), env);
      }
    }
  },
};

async function handleMessage(text, env, userId) {
  if (text.startsWith("追蹤")) {
    const stockId = extractStockId(text.slice(2));
    if (!stockId) return "格式：追蹤 2330";
    const list = await getWatchlist(env, userId);
    if (!list.includes(stockId)) {
      list.push(stockId);
      await setWatchlist(env, userId, list);
    }
    return `已追蹤 ${stockId}\n目前清單：${list.join("、")}`;
  }

  if (text.startsWith("取消追蹤") || text.startsWith("取消")) {
    const stockId = extractStockId(text.replace("取消追蹤", "").replace("取消", ""));
    if (!stockId) return "格式：取消追蹤 2330";
    const list = await getWatchlist(env, userId);
    const next = list.filter((id) => id !== stockId);
    await setWatchlist(env, userId, next);
    return `已取消追蹤 ${stockId}\n目前清單：${next.length ? next.join("、") : "（無）"}`;
  }

  if (text === "清單" || text === "追蹤清單") {
    const list = await getWatchlist(env, userId);
    return `目前追蹤：${list.length ? list.join("、") : "（無）"}`;
  }

  const stockId = extractStockId(text);
  if (stockId) {
    return await queryStock(stockId, env);
  }

  return "指令：\n- 打股票代號查詢，如「2330」\n- 「追蹤 2454」新增追蹤\n- 「取消追蹤 2454」移除追蹤\n- 「清單」看目前追蹤股票";
}

function extractStockId(text) {
  const match = text.trim().match(/^\d{4,6}$/);
  return match ? match[0] : null;
}

async function registerUser(env, userId) {
  const users = await getUsers(env);
  if (!users.includes(userId)) {
    users.push(userId);
    await env.WATCHLIST_KV.put("users", JSON.stringify(users));
  }
}

async function getUsers(env) {
  const raw = await env.WATCHLIST_KV.get("users");
  return raw ? JSON.parse(raw) : [];
}

async function getWatchlist(env, userId) {
  const raw = await env.WATCHLIST_KV.get(`watchlist:${userId}`);
  return raw ? JSON.parse(raw) : [];
}

async function setWatchlist(env, userId, list) {
  await env.WATCHLIST_KV.put(`watchlist:${userId}`, JSON.stringify(list));
}

async function fetchStockRows(stockId, env) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 60); // 抓近60天，足夠算20日均線
  const startDate = start.toISOString().slice(0, 10);

  let url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${stockId}&start_date=${startDate}`;
  if (env.FINMIND_TOKEN) url += `&token=${env.FINMIND_TOKEN}`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (!data.data || data.data.length === 0) return null;
  return data.data.sort((a, b) => (a.date > b.date ? 1 : -1));
}

async function queryStock(stockId, env) {
  const rows = await fetchStockRows(stockId, env);
  if (!rows) return `查無 ${stockId} 的資料，請確認代號正確`;

  const closes = rows.map((r) => r.close);
  if (closes.length < SLOW_PERIOD + 1) {
    return `${stockId} 資料筆數不足，無法判斷均線交叉`;
  }

  const latest = rows[rows.length - 1];
  const changePct = (((latest.close - latest.open) / latest.open) * 100).toFixed(2);

  const fastMaNow = average(closes.slice(-FAST_PERIOD));
  const slowMaNow = average(closes.slice(-SLOW_PERIOD));
  const fastMaPrev = average(closes.slice(-FAST_PERIOD - 1, -1));
  const slowMaPrev = average(closes.slice(-SLOW_PERIOD - 1, -1));

  let signal;
  const prevDiff = fastMaPrev - slowMaPrev;
  const currDiff = fastMaNow - slowMaNow;
  if (prevDiff <= 0 && currDiff > 0) signal = "剛出現買進訊號（5日穿20日向上）";
  else if (prevDiff >= 0 && currDiff < 0) signal = "剛出現賣出訊號（5日穿20日向下）";
  else if (currDiff > 0) signal = "5日線在20日線之上（多頭排列）";
  else signal = "5日線在20日線之下（空頭排列）";

  return (
    `${stockId}（${latest.date}）\n` +
    `收盤 ${latest.close}，漲跌 ${changePct}%\n` +
    `5日均線 ${fastMaNow.toFixed(2)} / 20日均線 ${slowMaNow.toFixed(2)}\n` +
    `狀態：${signal}`
  );
}

// 排程推播用：只回傳 'buy' / 'sell' / null，判斷最新一天是否剛好交叉
async function detectCrossSignal(stockId, env) {
  const rows = await fetchStockRows(stockId, env);
  if (!rows) return null;

  const closes = rows.map((r) => r.close);
  if (closes.length < SLOW_PERIOD + 1) return null;

  const fastMaNow = average(closes.slice(-FAST_PERIOD));
  const slowMaNow = average(closes.slice(-SLOW_PERIOD));
  const fastMaPrev = average(closes.slice(-FAST_PERIOD - 1, -1));
  const slowMaPrev = average(closes.slice(-SLOW_PERIOD - 1, -1));

  const prevDiff = fastMaPrev - slowMaPrev;
  const currDiff = fastMaNow - slowMaNow;
  if (prevDiff <= 0 && currDiff > 0) return "buy";
  if (prevDiff >= 0 && currDiff < 0) return "sell";
  return null;
}

function average(nums) {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

async function replyToLine(replyToken, text, env) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
  });
}

async function pushToLine(userId, text, env) {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: "text", text }],
    }),
  });
}

async function verifySignature(body, signature, channelSecret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
  return expected === signature;
}
