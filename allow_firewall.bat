@echo off
:: Run as Admin check
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo ===================================================
echo  Ludo X BD - Mobile Wi-Fi Access Setup
echo ===================================================
echo.
echo 1. Opening Port 8080 in Windows Firewall...
netsh advfirewall firewall delete rule name="LudoXBD_8080" >nul 2>&1
netsh advfirewall firewall add rule name="LudoXBD_8080" dir=in action=allow protocol=TCP localport=8080

echo 2. Setting Wi-Fi network to Private...
powershell -Command "Set-NetConnectionProfile -Name 'ABCD_5G' -NetworkCategory Private -ErrorAction SilentlyContinue"

echo.
echo ===================================================
echo  SUCCESS! Your mobile can now connect!
echo  Mobile URL: http://192.168.0.108:8080
echo ===================================================
echo.
timeout /t 5
