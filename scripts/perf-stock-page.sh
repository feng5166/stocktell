#!/usr/bin/env bash
# 个股详情页加载性能基准 —— 记录测试用例,优化前后重跑对比。
# 用法:  bash scripts/perf-stock-page.sh              # 默认打生产、默认5只票、每接口3轮
#        BASE=https://xxx CODES="300308 601138" RUNS=3 bash scripts/perf-stock-page.sh
#
# 测什么(个股详情页真实加载链路):
#   HTML壳      GET /stock/<code>                 ISR静态壳 TTFB + 整页 total
#   行情quotes  GET /api/quotes?symbols=<code>    LiveQuote(新浪→撞超时则吐过期缓存)
#   基本面fund  GET /api/fundamentals?code=<code> Fundamentals(Tushare;未命中缓存则回源)
#   联动similar GET /api/similarity?code=<code>   Similarity(仅A股)
# 记录:每次的 http / TTFB(time_starttransfer) / total(time_total),单位秒。
# 说明:浏览器里三个 API 并行,这里顺序测是为拿干净的单模块耗时。深读(/api/briefing/explain)
#      为点击后按需加载,不计入初始加载,不测。

set -u
BASE="${BASE:-https://www.stocktell.me}"
CODES="${CODES:-300308 601138 688041 688256 000977}"   # 中际旭创/工业富联/海光信息/寒武纪/浪潮信息(均A股)
RUNS="${RUNS:-3}"
TIMEOUT="${TIMEOUT:-40}"

echo "===== 个股详情页性能基准 ====="
echo "时间: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "BASE: $BASE   RUNS/接口: $RUNS   单次超时: ${TIMEOUT}s"
echo "指标: http | TTFB(首字节)s | total(总)s"
echo

curl -s -o /dev/null -m 15 "$BASE/api/quotes?symbols=300308" >/dev/null 2>&1  # 预热连接/DNS/TLS

t() { curl -s -o /dev/null -m "$TIMEOUT" -w "%{http_code} | TTFB=%{time_starttransfer} | total=%{time_total}" "$1"; }

measure() { # $1=label  $2=url
  printf "  %-14s" "$1"
  for i in $(seq 1 "$RUNS"); do printf "  [第%d次] " "$i"; t "$2"; done
  echo
}

for code in $CODES; do
  echo "────── $code ──────"
  measure "HTML壳"      "$BASE/stock/$code"
  measure "行情quotes"  "$BASE/api/quotes?symbols=$code"
  measure "基本面fund"  "$BASE/api/fundamentals?code=$code"
  measure "联动similar" "$BASE/api/similarity?code=$code"
  echo
done
echo "===== 完 ====="
