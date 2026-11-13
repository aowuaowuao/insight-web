@echo off
chcp 65001 >nul
title Insight Web - 开发服务器
cd /d "%~dp0"

if not exist node_modules (
  echo 首次运行，正在安装依赖，请稍候...
  call npm install
)

echo.
echo  正在启动开发服务器...
echo  浏览器会自动打开 http://localhost:5173
echo  关闭本窗口即可停止服务器
echo.

call npm run dev -- --open

pause