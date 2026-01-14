@echo off
chcp 65001 >nul
echo ========================================
echo   待办事项应用 - 一键启动
echo ========================================
echo.

REM 检查 Node.js 是否安装
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js
    echo 请先安装 Node.js: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM 检查 Python 是否安装
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Python
    echo 请先安装 Python: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

REM 切换到脚本所在目录
cd /d "%~dp0"

echo [信息] 正在启动服务...
echo.

REM 先停止可能已运行的服务
echo [信息] 正在停止旧服务（如果存在）...
taskkill /F /FI "WINDOWTITLE eq 企业微信代理服务器*" /T >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq 前端服务器*" /T >nul 2>&1
taskkill /F /IM node.exe /FI "WINDOWTITLE eq 企业微信代理服务器*" >nul 2>&1
for /f "tokens=2" %%a in ('netstat -ano 2^>nul ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=2" %%a in ('netstat -ano 2^>nul ^| findstr :3001 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)
REM 等待端口完全释放
echo [信息] 等待端口释放...
timeout /t 2 /nobreak >nul

REM 启动代理服务器（后台运行，最小化窗口）
echo [信息] 正在启动代理服务器...
start /min "企业微信代理服务器" cmd /k "cd /d %~dp0 && node proxy-server.js"

REM 等待代理服务器启动并检测
echo [信息] 等待代理服务器启动...
set PROXY_READY=0
for /L %%i in (1,1,10) do (
    timeout /t 1 /nobreak >nul
    netstat -ano | findstr :3001 | findstr LISTENING >nul 2>&1
    if not errorlevel 1 (
        set PROXY_READY=1
        echo [信息] 代理服务器已启动
        goto :proxy_ready
    )
)
:proxy_ready
if %PROXY_READY%==0 (
    echo [错误] 代理服务器启动失败，请检查 Node.js 和端口 3001
    pause
    exit /b 1
)

REM 启动前端服务器（后台运行，最小化窗口）
echo [信息] 正在启动前端服务器...
start /min "前端服务器" cmd /k "cd /d %~dp0 && python -m http.server 8000"

REM 等待前端服务器启动并检测
echo [信息] 等待前端服务器启动...
set FRONTEND_READY=0
for /L %%i in (1,1,10) do (
    timeout /t 1 /nobreak >nul
    netstat -ano | findstr :8000 | findstr LISTENING >nul 2>&1
    if not errorlevel 1 (
        set FRONTEND_READY=1
        echo [信息] 前端服务器已启动
        goto :frontend_ready
    )
)
:frontend_ready
if %FRONTEND_READY%==0 (
    echo [错误] 前端服务器启动失败，请检查 Python 和端口 8000
    pause
    exit /b 1
)

REM 再等待一下确保服务器完全就绪
timeout /t 1 /nobreak >nul

REM 自动打开浏览器
echo [信息] 正在打开浏览器...
start http://localhost:8000

echo.
echo ========================================
echo   服务已启动！
echo   前端地址: http://localhost:8000
echo   代理服务器: http://localhost:3001
echo.
echo   提示：
echo   - 浏览器已自动打开
echo   - 服务器在后台运行（任务栏可看到）
echo   - 关闭此窗口不会停止服务
echo   - 要停止服务，请运行"停止服务.bat"
echo ========================================
echo.

REM 保持窗口打开，但可以最小化
timeout /t 3 /nobreak >nul
echo [提示] 您可以关闭此窗口，服务将继续在后台运行
echo [提示] 要停止服务，请运行"停止服务.bat"或关闭任务栏中的服务器窗口
echo.
pause
