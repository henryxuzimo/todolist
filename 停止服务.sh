#!/bin/bash

echo "========================================"
echo "  停止待办事项服务"
echo "========================================"
echo ""

echo "[信息] 正在停止服务..."

# 从 PID 文件读取进程 ID
if [ -f .proxy-server.pid ]; then
    PROXY_PID=$(cat .proxy-server.pid)
    if kill -0 $PROXY_PID 2>/dev/null; then
        kill $PROXY_PID
        echo "[信息] 代理服务器已停止"
    fi
    rm -f .proxy-server.pid
fi

if [ -f .frontend-server.pid ]; then
    FRONTEND_PID=$(cat .frontend-server.pid)
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        kill $FRONTEND_PID
        echo "[信息] 前端服务器已停止"
    fi
    rm -f .frontend-server.pid
fi

# 额外检查：通过端口查找并停止进程
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:8000 | xargs kill -9 2>/dev/null

echo "[信息] 服务已停止"
echo ""
