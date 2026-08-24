@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>nul
cd /d "%~dp0"
title 暮雨笺 v3.0.7 - 发布打包

:: 检查 Node.js 是否可用
where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\tools\node-v22.14.0-win-x64\node.exe" (
        set "PATH=C:\tools\node-v22.14.0-win-x64;%PATH%"
    ) else if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    ) else if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
    ) else (
        echo [错误] 未找到 Node.js，请先安装 Node.js ^(https://nodejs.org^)
        pause
        exit /b 1
    )
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [1/3] 正在安装锁定依赖...
    call npm ci
    if errorlevel 1 (
        echo.
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
) else (
    echo [1/3] 已检测到本地依赖，跳过安装。
)

:: electron-builder 使用本地 Electron 运行时，避免每次打包重复下载。
if not exist "electron-dist-local\electron.exe" (
    if exist "node_modules\electron\dist\electron.exe" (
        echo [准备] 正在准备本地 Electron 运行时...
        xcopy "node_modules\electron\dist\*" "electron-dist-local\" /E /I /Y >nul
    ) else (
        echo.
        echo [错误] 未找到 Electron 运行时，请先运行 npm ci 或重新安装依赖
        pause
        exit /b 1
    )
)

echo [2/3] 正在构建生产文件...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [错误] 构建失败，请检查代码
    pause
    exit /b 1
)

echo.
echo [3/3] 正在生成 v3.0.7 安装包...
if exist "release-temp" rmdir /s /q "release-temp"
call npx electron-builder --win --publish never --config.directories.output=release-temp
if %errorlevel% neq 0 (
    echo.
    echo [错误] 打包失败，已保留原 release 文件夹。
    pause
    exit /b 1
)
if exist "release" rmdir /s /q "release"
move "release-temp" "release" >nul

echo.
echo 打包完成！release 文件夹仅保留本次生成的发布版本。
explorer release
pause
endlocal
