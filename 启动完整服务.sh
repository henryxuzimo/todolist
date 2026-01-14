#!/bin/bash

echo "========================================"
echo "  待办事项应用 - 完整服务启动"
echo "========================================"
echo ""

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "[错误] 未检测到 Node.js"
    echo ""
    echo "请先安装 Node.js: https://nodejs.org/"
    echo ""
    exit 1
fi

echo "[信息] 检测到 Node.js"
echo ""

# 切换到脚本所在目录
cd "$(dirname "$0")"

echo "[信息] 正在启动代理服务器..."
node proxy-server.js &
PROXY_PID=$!

# 等待代理服务器启动
sleep 2

echo "[信息] 正在启动前端服务器..."
echo ""
echo "========================================"
echo "  前端地址: http://localhost:8000"
echo "  代理服务器: http://localhost:3001"
echo "  按 Ctrl+C 停止所有服务"
echo "========================================"
echo ""

# 检查 Python 是否安装
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "[错误] 未检测到 Python，无法启动前端服务器"
    echo "请安装 Python 或使用其他方式启动前端服务器"
    echo ""
    kill $PROXY_PID 2>/dev/null
    exit 1
fi

# 启动前端服务器
$PYTHON_CMD -m http.server 8000

# 清理：停止代理服务器
kill $PROXY_PID 2>/dev/null
