#!/bin/bash

echo "========================================"
echo "  检查服务状态"
echo "========================================"
echo ""

echo "[信息] 检查代理服务器（端口 3001）..."
if lsof -ti:3001 >/dev/null 2>&1; then
    echo "[状态] 代理服务器正在运行"
    lsof -i:3001
else
    echo "[状态] 代理服务器未运行"
fi

echo ""
echo "[信息] 检查前端服务器（端口 8000）..."
if lsof -ti:8000 >/dev/null 2>&1; then
    echo "[状态] 前端服务器正在运行"
    lsof -i:8000
else
    echo "[状态] 前端服务器未运行"
fi

echo ""
echo "[信息] 检查进程..."
ps aux | grep -E "node.*proxy-server|python.*http.server" | grep -v grep
echo ""
