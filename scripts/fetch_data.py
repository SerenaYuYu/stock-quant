"""每日抓取台股資料，存成 CSV 到 data/ 資料夾"""
import os
from FinMind.data import DataLoader

# 要追蹤的股票代號，之後自己增減
STOCK_IDS = ["2330", "2317", "0050"]

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(DATA_DIR, exist_ok=True)


def main():
    api = DataLoader()
    token = os.environ.get("FINMIND_TOKEN")
    if token:
        api.login_by_token(api_token=token)

    for stock_id in STOCK_IDS:
        df = api.taiwan_stock_daily(stock_id=stock_id, start_date="2023-01-01")
        out_path = os.path.join(DATA_DIR, f"{stock_id}.csv")
        df.to_csv(out_path, index=False)
        print(f"已更新 {stock_id} -> {out_path}（{len(df)} 筆）")


if __name__ == "__main__":
    main()
