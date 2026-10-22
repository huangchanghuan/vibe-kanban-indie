#!/usr/bin/env bash
# 启动 vibe-kanban-indie 开发服务（后台运行）
# 用法: ./scripts/dev-up.sh        前台日志: tail -f /tmp/vibe-kanban-dev.log
set -e
cd "$(dirname "$0")/.."

# 非交互 shell 不会读 ~/.bashrc，必须显式把 cargo 加进 PATH
export PATH="$HOME/.cargo/bin:$PATH"

if ss -tln 2>/dev/null | grep -qE ":3002 "; then
    echo "⚠️  端口 3002 已被占用，服务可能已在运行。先执行 ./scripts/dev-down.sh"
    exit 1
fi

LOG=/tmp/vibe-kanban-dev.log
nohup pnpm run dev > "$LOG" 2>&1 &
echo "✅ 已启动 (PID: $!)"
echo "   前端: http://localhost:3001"
echo "   后端: http://localhost:3002"
echo "   日志: tail -f $LOG"
