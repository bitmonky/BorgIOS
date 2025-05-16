:: @echo off
:: Run BorgHUIconduit.exe in a detached terminal
start "BorgHUIconduit" cmd /c "cd /d C:\BorgHUI && C:\BorgHUI\BorgHUIconduit.exe"

:: Open default browser to http://localhost
start "" "http://localhost"

