@echo off
echo Starting Redis 5.0 on Port 6380...
powershell -Command "Start-Process -FilePath '%TEMP%\Redis5\redis-server.exe' -ArgumentList '%TEMP%\Redis5\redis6380.conf' -WindowStyle Hidden"
echo Redis 5.0 started in background on Port 6380!
pause
