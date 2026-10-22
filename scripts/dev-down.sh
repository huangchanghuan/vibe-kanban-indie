#!/usr/bin/env bash
# 停止 vibe-kanban-indie 开发服务
# 顺序很重要：先杀 cargo watch（否则它会自动重启 server），再杀 server、vite 和上层 pnpm/npm
pkill -f "cargo watch" 2>/dev/null
sleep 1
pkill -f "target/debug/server" 2>/dev/null
pkill -f "vite -- --port" 2>/dev/null
pkill -f "concurrently" 2>/dev/null
pkill -f "pnpm run dev" 2>/dev/null
pkill -f "pnpm run backend:dev:watch" 2>/dev/null
pkill -f "pnpm run local-web:dev" 2>/dev/null
sleep 1

# 兜底：按端口强杀
if ss -tln 2>/dev/null | grep -qE ":3001 |:3002 "; then
    echo "仍有端口占用，强制清理："
    ss -tlnp 2>/dev/null | grep -E ":3001 |:3002 " || true
    fuser -k 3001/tcp 3002/tcp 3003/tcp 2>/dev/null
    sleep 1
fi

if ss -tln 2>/dev/null | grep -qE ":3001 |:3002 "; then
    echo "❌ 停止失败，请手动检查: ss -tlnp | grep -E ':3001|:3002'"
    exit 1
fi

echo "✅ 已停止（3001/3002 端口已释放）"
