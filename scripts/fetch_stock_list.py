"""抓全市場股票代號清單（上市/上櫃/興櫃），存成 data/stock_list.csv
一次性使用，非每日排程；要更新清單時手動重跑即可"""
import os

from FinMind.data import DataLoader

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def main():
    api = DataLoader()
    token = os.environ.get("FINMIND_TOKEN")
    if token:
        api.login_by_token(api_token=token)

    df = api.taiwan_stock_info()
    out_path = os.path.join(DATA_DIR, "stock_list.csv")
    df.to_csv(out_path, index=False)
    print(f"已存 {len(df)} 檔股票清單 -> {out_path}")


if __name__ == "__main__":
    main()
