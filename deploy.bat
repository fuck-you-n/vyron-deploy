@echo off
echo === Vyron Deploy ===
cd /d "%~dp0"
git add -A
git commit -m "update %date% %time%"
git push
echo === Done ===
pause
