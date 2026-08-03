"""均線交叉策略回測：短均線上穿長均線買進，下穿賣出"""
import os
import sys

import pandas as pd
from backtesting import Backtest, Strategy
from backtesting.lib import crossover

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


class MaCross(Strategy):
    # 短、長均線天數，可依需求調整
    fast_period = 5
    slow_period = 20

    def init(self):
        close = pd.Series(self.data.Close)
        self.fast_ma = self.I(lambda x: x.rolling(self.fast_period).mean(), close)
        self.slow_ma = self.I(lambda x: x.rolling(self.slow_period).mean(), close)

    def next(self):
        # 短均線上穿長均線 → 買進；下穿 → 賣出出場
        if crossover(self.fast_ma, self.slow_ma):
            self.buy()
        elif crossover(self.slow_ma, self.fast_ma):
            self.position.close()


def load_data(stock_id: str) -> pd.DataFrame:
    path = os.path.join(DATA_DIR, f"{stock_id}.csv")
    df = pd.read_csv(path, parse_dates=["date"])
    df = df.rename(columns={
        "date": "Date", "open": "Open", "max": "High",
        "min": "Low", "close": "Close", "Trading_Volume": "Volume",
    })
    return df.set_index("Date")[["Open", "High", "Low", "Close", "Volume"]]


def main():
    stock_id = sys.argv[1] if len(sys.argv) > 1 else "2330"
    data = load_data(stock_id)

    bt = Backtest(data, MaCross, cash=1_000_000, commission=0.001425)
    stats = bt.run()
    print(stats)

    out_path = os.path.join(DATA_DIR, "..", f"backtest_{stock_id}.html")
    bt.plot(filename=out_path, open_browser=False)
    print(f"圖表已存到 {out_path}")


if __name__ == "__main__":
    main()
