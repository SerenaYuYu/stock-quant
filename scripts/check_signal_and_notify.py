"""檢查各股票最新一天是否出現均線交叉訊號，有訊號就發 LINE 通知"""
import os

import pandas as pd
import requests

from fetch_data import STOCK_IDS

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
LINE_API_URL = "https://api.line.me/v2/bot/message/push"

# 均線天數，需與 backtest_ma_cross.py 一致
FAST_PERIOD = 5
SLOW_PERIOD = 20


def detect_signal(stock_id: str) -> str | None:
    """回傳 'buy'、'sell' 或 None（無訊號）"""
    path = os.path.join(DATA_DIR, f"{stock_id}.csv")
    df = pd.read_csv(path, parse_dates=["date"]).sort_values("date")

    if len(df) < SLOW_PERIOD + 1:
        return None

    fast_ma = df["close"].rolling(FAST_PERIOD).mean()
    slow_ma = df["close"].rolling(SLOW_PERIOD).mean()

    # 比較最新一天與前一天的快慢均線相對位置，判斷是否剛好穿越
    prev_diff = fast_ma.iloc[-2] - slow_ma.iloc[-2]
    curr_diff = fast_ma.iloc[-1] - slow_ma.iloc[-1]

    if prev_diff <= 0 and curr_diff > 0:
        return "buy"
    if prev_diff >= 0 and curr_diff < 0:
        return "sell"
    return None


def send_line_message(text: str) -> None:
    token = os.environ["LINE_CHANNEL_ACCESS_TOKEN"]
    user_id = os.environ["LINE_USER_ID"]
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }
    body = {
        "to": user_id,
        "messages": [{"type": "text", "text": text}],
    }
    resp = requests.post(LINE_API_URL, headers=headers, json=body, timeout=10)
    resp.raise_for_status()


def main():
    messages = []
    for stock_id in STOCK_IDS:
        signal = detect_signal(stock_id)
        if signal == "buy":
            messages.append(f"{stock_id}：5日均線上穿20日均線，買進訊號")
        elif signal == "sell":
            messages.append(f"{stock_id}：5日均線下穿20日均線，賣出訊號")

    if not messages:
        print("今日無均線交叉訊號")
        return

    text = "\n".join(messages)
    send_line_message(text)
    print(f"已發送 LINE 通知：\n{text}")


if __name__ == "__main__":
    main()
