@echo off
chcp 65001 >nul
echo ========================================
echo   停止待办事项服务
echo ========================================
echo.

echo [信息] 正在停止服务...

REM 停止 Node.js 进程（代理服务器）
taskkill /F /FI "WINDOWTITLE eq 企业微信代理服务器*" /T >nul 2>&1
taskkill /F /IM node.exe /FI "WINDOWTITLE eq 企业微信代理服务器*" >nul 2>&1

REM 停止 Python HTTP 服务器（前端服务器）
taskkill /F /FI "WINDOWTITLE eq 前端服务器*" /T >nul 2>&1
for /f "tokens=2" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

REM 停止占用 3001 端口的进程（代理服务器）
for /f "tokens=2" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [信息] 服务已停止
echo.
pause
