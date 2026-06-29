#!/usr/bin/env bash
# StockTell 端到端冒烟测试(含登录态)。
#
# 为什么有它:很多功能(自选、深读、推送…)要登录才生效,无法靠 curl 公开接口验证。
# 本脚本用 NextAuth 凭证登录拿到会话 cookie,再跑登录态用例,任何人/CI 都能自动验证。
#
# 用法:
#   bash scripts/smoke.sh                      # 默认打生产 www.stocktell.me
#   BASE_URL=https://<preview>.vercel.app bash scripts/smoke.sh
#   QA_EMAIL=... QA_PASSWORD=... bash scripts/smoke.sh   # 用自定义测试账号
#
# 退出码:全部通过=0,有失败=1(CI 可据此判定)。
# 说明:默认用一个专用 QA 账号(无敏感数据),用例结束会清理自己写入的自选。

set -uo pipefail

BASE="${BASE_URL:-https://www.stocktell.me}"
EMAIL="${QA_EMAIL:-selftest-qa@stocktell.app}"
PASS="${QA_PASSWORD:-SelfTest-QA-2026!}"
JAR="$(mktemp -t stbot-jar.XXXXXX)"
trap 'rm -f "$JAR"' EXIT

PASS_N=0
FAIL_N=0
ok() { echo "  ✅ $1"; PASS_N=$((PASS_N + 1)); }
ng() { echo "  ❌ $1"; FAIL_N=$((FAIL_N + 1)); }

# has_field <json> <python-assert>:assert 通过则真。assert 形如 "'x' in d['codes']"
assert_json() { python3 -c "import sys,json;d=json.load(sys.stdin);assert ($2)" 2>/dev/null; }

echo "== StockTell 冒烟测试 @ $BASE =="

# ---------- 数据自检(静态,不依赖网络) ----------
echo "[数据自检]"
if node "$(dirname "$0")/data-check.mjs"; then ok "AI产业链数据自检通过(无硬错误)"; else ng "AI产业链数据自检有硬错误"; fi

# ---------- 公开接口 ----------
echo "[公开接口]"
curl -s -m 25 "$BASE/api/quotes" | assert_json _ "'quotes' in d" && ok "/api/quotes 正常" || ng "/api/quotes"
curl -s -m 25 "$BASE/api/etf-quotes" | assert_json _ "'quotes' in d" && ok "/api/etf-quotes 正常" || ng "/api/etf-quotes"
# 反馈接口:只验校验(空内容应 400),不提交真反馈以免刷飞书
FB_CODE=$(curl -s -m 15 -o /dev/null -w "%{http_code}" -X POST "$BASE/api/feedback" \
  -H 'Content-Type: application/json' -d '{"content":""}')
[ "$FB_CODE" = "400" ] && ok "/api/feedback 校验正常(空内容 400)" || ng "/api/feedback 校验异常(got $FB_CODE)"

# ---------- 登录 ----------
echo "[登录]"
curl -s -m 20 -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" >/dev/null  # 已存在则 409,无所谓
CSRF=$(curl -s -m 20 -c "$JAR" "$BASE/api/auth/csrf" |
  python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])" 2>/dev/null)
curl -s -m 20 -c "$JAR" -b "$JAR" -X POST "$BASE/api/auth/callback/credentials" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "email=$EMAIL" \
  --data-urlencode "password=$PASS" \
  --data-urlencode "json=true" \
  --data-urlencode "callbackUrl=$BASE" >/dev/null
# 注意:不要用变量名 UID —— 它是 bash 只读内置(shell 用户 id),赋值会失败且永远非空
SESS=$(curl -s -m 20 -b "$JAR" "$BASE/api/auth/session" |
  python3 -c "import sys,json;print(json.load(sys.stdin).get('user',{}).get('id') or '')" 2>/dev/null)
if [ -n "$SESS" ]; then
  ok "登录成功 (uid=${SESS:0:8}…)"
else
  ng "登录失败 —— 跳过全部登录态用例"
  echo "== 结果:$PASS_N 过 / $FAIL_N 败 =="
  exit 1
fi

# ---------- 登录态:自选(个股 + ETF) ----------
echo "[自选]"
for c in 300308 159995; do curl -s -m 15 -b "$JAR" -X DELETE "$BASE/api/watchlist?code=$c" >/dev/null; done
curl -s -m 15 -b "$JAR" -X POST "$BASE/api/watchlist" -H 'Content-Type: application/json' -d '{"code":"300308"}' >/dev/null
curl -s -m 15 -b "$JAR" -X POST "$BASE/api/watchlist" -H 'Content-Type: application/json' -d '{"code":"159995"}' >/dev/null
LIST=$(curl -s -m 15 -b "$JAR" "$BASE/api/watchlist")
echo "$LIST" | assert_json _ "'300308' in d['codes']" && ok "个股自选已落库" || ng "个股自选未落库"
echo "$LIST" | assert_json _ "'159995' in d['codes']" && ok "ETF 自选已落库(回归:35e3f34)" || ng "ETF 自选未落库"
for c in 300308 159995; do curl -s -m 15 -b "$JAR" -X DELETE "$BASE/api/watchlist?code=$c" >/dev/null; done
curl -s -m 15 -b "$JAR" "$BASE/api/watchlist" |
  assert_json _ "'159995' not in d['codes'] and '300308' not in d['codes']" &&
  ok "删除自选生效(已清理)" || ng "删除自选未生效"

# ---------- 登录态:邮件推送偏好(/settings 邮件开关 + 邮件退订共用 digest_opt_out) ----------
echo "[邮件推送偏好]"
curl -s -m 15 -b "$JAR" "$BASE/api/me/digest-pref" |
  assert_json _ "isinstance(d.get('enabled'), bool)" && ok "读取邮件偏好正常" || ng "读取邮件偏好失败"
curl -s -m 15 -b "$JAR" -X POST "$BASE/api/me/digest-pref" \
  -H 'Content-Type: application/json' -d '{"enabled":false}' |
  assert_json _ "d['enabled'] is False" && ok "关闭邮件推送生效" || ng "关闭邮件推送失败"
curl -s -m 15 -b "$JAR" "$BASE/api/me/digest-pref" |
  assert_json _ "d['enabled'] is False" && ok "关闭状态已落库" || ng "关闭状态未落库"
curl -s -m 15 -b "$JAR" -X POST "$BASE/api/me/digest-pref" \
  -H 'Content-Type: application/json' -d '{"enabled":true}' |
  assert_json _ "d['enabled'] is True" && ok "重新开启生效(已还原)" || ng "重新开启失败"

# ---------- 登录态:深读(早报/资金面/个股 explain 流式) ----------
echo "[StockTell 深读]"
DEEP=$(curl -s -m 60 -b "$JAR" -X POST "$BASE/api/briefing/explain" \
  -H 'Content-Type: application/json' -d '{"code":"300308"}')
[ "${#DEEP}" -gt 50 ] && ok "个股深读返回内容(${#DEEP} 字)" || ng "个股深读无内容"

echo
echo "== 结果:$PASS_N 过 / $FAIL_N 败 =="
[ "$FAIL_N" -eq 0 ]
