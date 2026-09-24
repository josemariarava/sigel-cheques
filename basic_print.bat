@echo off
echo PRUEBA BASICA > C:\Users\jmramirez\AppData\Local\Temp\opencom\basico.txt
print /D:"EPSONTM-H6000VI Slip" C:\Users\jmramirez\AppData\Local\Temp\opencom\basico.txt
echo.
echo Exit: %errorlevel%
del C:\Users\jmramirez\AppData\Local\Temp\opencom\basico.txt
