@echo off
cd /d "%~dp0"
echo ============================================
echo   Sistema de Impresion de Cheques - Epson
echo ============================================
tasklist /fi "imagename eq node.exe" 2>nul | find /i "node.exe" >nul
if errorlevel 1 (
  echo Iniciando servidor...
  start "" node server.js
  timeout /t 2 /nobreak >nul
) else (
  echo Servidor ya en ejecucion.
)
start "" http://localhost:3000/
echo Listo. Navegador abierto en http://localhost:3000/
