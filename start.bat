@echo off
chcp 65001 > nul
title Червячные Войны 2D

echo ========================================================
echo   🐛 Запуск игры "Червячные Войны 2D" (Worms Battle)
echo ========================================================

cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel% equ 0 (
    python server.py
) else (
    echo Python не найден в PATH, открываем index.html напрямую...
    start "" "index.html"
)

pause
