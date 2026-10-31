@echo off
set PATH=C:\Users\hp\.git-bin\cmd;%PATH%
echo ========================================================
echo   Pushing Ludo X BD to GitHub (amitkhulna100/Ludoxbd)
echo ========================================================
echo.
git push -u origin main
echo.
if errorlevel 1 (
    echo [ERROR] Push unsuccessful. If prompted for password, please use your
    echo GitHub Personal Access Token (PAT) from: https://github.com/settings/tokens
) else (
    echo [SUCCESS] Code successfully pushed to GitHub!
)
echo.
pause
