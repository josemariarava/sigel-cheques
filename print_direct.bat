@echo off
echo PRUEBA DE IMPRESION DIRECTA > "C:\Users\jmramirez\AppData\Local\Temp\opencom\test_direct.txt"
print /D:"EPSON TM-H6000VI Slip" "C:\Users\jmramirez\AppData\Local\Temp\opencom\test_direct.txt"
echo Exit code: %errorlevel%
