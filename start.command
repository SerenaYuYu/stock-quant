#!/bin/bash
# 雙擊這個檔案：自動進入專案資料夾 + 啟用虛擬環境 + 開新終端機視窗
cd "$(dirname "$0")"
source venv/bin/activate
echo "環境已啟用：$(python --version)，位置：$(pwd)"
exec $SHELL
