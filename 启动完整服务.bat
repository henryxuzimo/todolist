@echo off
chcp 65001 >nul
echo ========================================
echo   待办事项应用 - 完整服务启动
echo ========================================
echo.

REM 检查 Node.js 是否安装
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js
    echo.
    echo 请先安装 Node.js: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [信息] 检测到 Node.js
echo.

REM 切换到脚本所在目录
cd /d "%~dp0"

echo [信息] 正在启动代理服务器...
start "企业微信代理服务器" cmd /k "node proxy-server.js"

REM 等待代理服务器启动
timeout /t 2 /nobreak >nul

echo [信息] 正在启动前端服务器...
echo.
echo ========================================
echo   前端地址: http://localhost:8000
echo   代理服务器: http://localhost:3001
echo   按 Ctrl+C 停止所有服务
echo ========================================
echo.

REM 检查 Python 是否安装
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Python，无法启动前端服务器
    echo 请安装 Python 或使用其他方式启动前端服务器
    echo.
    pause
    exit /b 1
)

REM 启动前端服务器
python -m http.server 8000

pause
