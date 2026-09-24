@echo off
echo Elevando permisos para configurar impresion directa...
powershell -ExecutionPolicy Bypass -Command "Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Print\Printers\EPSON TM-H6000VI Slip' -Name 'Attributes' -Value 0x1a0a -Type DWord" 2>&1
echo Hecho.
pause
