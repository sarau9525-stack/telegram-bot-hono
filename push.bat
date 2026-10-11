@echo off
chcp 65001 > nul
cls
echo [1/4] git status...
git status -s
echo [2/4] git add .
git add .
set /p commit_msg="> پیام کامیت: "
if "%commit_msg%"=="" (set commit_msg=Update project: %date% %time%)
git commit -m "%commit_msg%"
echo [4/4] git push origin main...
git push origin main
echo ✅ انجام شد!
pause > nul
