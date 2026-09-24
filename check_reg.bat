@echo off
REM Check if printer is set to print to file
reg query "HKLM\SYSTEM\CurrentControlSet\Control\Print\Printers\EPSON TM-H6000VI Slip" 2>&1
echo.
echo --- Checking DevMode ---
reg query "HKLM\SYSTEM\CurrentControlSet\Control\Print\Printers\EPSON TM-H6000VI Slip\DevMode" 2>&1
echo.
echo --- Check Port ---
reg query "HKLM\SYSTEM\CurrentControlSet\Control\Print\Printers\EPSON TM-H6000VI Slip" /v PortName 2>&1
