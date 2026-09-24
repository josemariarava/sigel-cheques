@echo off
REM Enable "Print directly to the printer" using printui
printui /Sr /a /n "EPSON TM-H6000VI Slip" 2>&1
REM The /a flag saves all settings. Now we need to set the Direct flag.

REM Use reg to set the Direct attribute
REM PRINTER_ATTRIBUTE_DIRECT = 0x0002
REM We need to modify the Attributes value in the registry
REM Current: 0x1a08
REM We want: 0x1a08 OR 0x0002 = 0x1a0a

echo Current attributes need to include DIRECT flag (0x0002)
echo Using PowerShell to set Direct printing...

powershell -ExecutionPolicy Bypass -Command "Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Print\Printers\EPSON TM-H6000VI Slip' -Name 'Attributes' -Value 0x1a0a -Type DWord" 2>&1
echo Done setting Direct attribute.

echo.
echo Restart spooler needed.
