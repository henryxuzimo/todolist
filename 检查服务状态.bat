@echo off
chcp 65001 >nul
echo ========================================
echo   检查服务状态
echo ========================================
echo.

echo [信息] 检查代理服务器（端口 3001）...
netstat -ano | findstr :3001 | findstr LISTENING >nul 2>&1
if errorlevel 1 (
    echo [状态] 代理服务器未运行
) else (
    echo [状态] 代理服务器正在运行
    netstat -ano | findstr :3001 | findstr LISTENING
)

echo.
echo [信息] 检查前端服务器（端口 8000）...
netstat -ano | findstr :8000 | findstr LISTENING >nul 2>&1
if errorlevel 1 (
    echo [状态] 前端服务器未运行
) else (
    echo [状态] 前端服务器正在运行
    netstat -ano | findstr :8000 | findstr LISTENING
)

echo.
echo [信息] 检查进程...
tasklist | findstr /i "node.exe python.exe" | findstr /v "tasklist"
echo.
pause
