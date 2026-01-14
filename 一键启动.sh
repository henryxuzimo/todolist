#!/bin/bash

echo "========================================"
echo "  待办事项应用 - 一键启动"
echo "========================================"
echo ""

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "[错误] 未检测到 Node.js"
    echo "请先安装 Node.js: https://nodejs.org/"
    echo ""
    exit 1
fi

# 检查 Python 是否安装
if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
    echo "[错误] 未检测到 Python"
    echo "请先安装 Python: https://www.python.org/downloads/"
    echo ""
    exit 1
fi

# 切换到脚本所在目录
cd "$(dirname "$0")"

echo "[信息] 正在启动服务..."
echo ""

# 先停止可能已运行的服务
echo "[信息] 正在停止旧服务（如果存在）..."
if [ -f .proxy-server.pid ]; then
    kill $(cat .proxy-server.pid) 2>/dev/null
    rm -f .proxy-server.pid
fi
if [ -f .frontend-server.pid ]; then
    kill $(cat .frontend-server.pid) 2>/dev/null
    rm -f .frontend-server.pid
fi
# 通过端口查找并停止进程
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:8000 | xargs kill -9 2>/dev/null
# 等待端口完全释放
echo "[信息] 等待端口释放..."
sleep 2

# 启动代理服务器（后台运行）
echo "[信息] 正在启动代理服务器..."
node proxy-server.js > proxy-server.log 2>&1 &
PROXY_PID=$!

# 等待代理服务器启动并检测
echo "[信息] 等待代理服务器启动..."
PROXY_READY=0
for i in {1..10}; do
    sleep 1
    if lsof -ti:3001 >/dev/null 2>&1; then
        PROXY_READY=1
        echo "[信息] 代理服务器已启动"
        break
    fi
done

if [ $PROXY_READY -eq 0 ]; then
    echo "[错误] 代理服务器启动失败，请检查 Node.js 和端口 3001"
    kill $PROXY_PID 2>/dev/null
    exit 1
fi

# 启动前端服务器（后台运行）
echo "[信息] 正在启动前端服务器..."
if command -v python3 &> /dev/null; then
    python3 -m http.server 8000 > frontend-server.log 2>&1 &
else
    python -m http.server 8000 > frontend-server.log 2>&1 &
fi
FRONTEND_PID=$!

# 等待前端服务器启动并检测
echo "[信息] 等待前端服务器启动..."
FRONTEND_READY=0
for i in {1..10}; do
    sleep 1
    if lsof -ti:8000 >/dev/null 2>&1; then
        FRONTEND_READY=1
        echo "[信息] 前端服务器已启动"
        break
    fi
done

if [ $FRONTEND_READY -eq 0 ]; then
    echo "[错误] 前端服务器启动失败，请检查 Python 和端口 8000"
    kill $PROXY_PID $FRONTEND_PID 2>/dev/null
    exit 1
fi

# 再等待一下确保服务器完全就绪
sleep 1

# 保存 PID 到文件，方便停止服务
echo $PROXY_PID > .proxy-server.pid
echo $FRONTEND_PID > .frontend-server.pid

# 自动打开浏览器
echo "[信息] 正在打开浏览器..."

# 检测操作系统并使用相应的命令打开浏览器
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    open http://localhost:8000
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    if command -v xdg-open &> /dev/null; then
        xdg-open http://localhost:8000
    elif command -v gnome-open &> /dev/null; then
        gnome-open http://localhost:8000
    fi
fi

echo ""
echo "========================================"
echo "  服务已启动！"
echo "  前端地址: http://localhost:8000"
echo "  代理服务器: http://localhost:3001"
echo ""
echo "  提示："
echo "  - 浏览器已自动打开"
echo "  - 服务器在后台运行"
echo "  - 要停止服务，请运行 './停止服务.sh'"
echo "========================================"
echo ""
