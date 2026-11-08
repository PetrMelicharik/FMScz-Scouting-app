@echo off
rem ==========================================================================
rem  Aktualizace udaju z Transfermarktu (trzni hodnota, pozice, smlouva, noha)
rem  - spust dvojklikem. Trva zhruba 1-2 hodiny.
rem
rem  Co se stane:
rem   1. Stahnou se novinky z GitHubu (git pull).
rem   2. Python skript projde soupisky klubu na Transfermarktu a ulozi
rem      data\tm_data.json. Kdyz ho prerusis nebo te Transfermarkt docasne
rem      zablokuje, pri dalsim spusteni pokracuje tam, kde skoncil.
rem   3. Po tvem potvrzeni se tm_data.json posle na GitHub a Vercel nasadi
rem      novou verzi aplikace.
rem ==========================================================================
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"

echo.
echo === 0) Stahuji novinky z GitHubu...
git pull --ff-only
if errorlevel 1 (
    echo.
    echo !!! Nepodarilo se stahnout novinky z GitHubu. Nic jsem nezmenil.
    goto konec
)

py python\transfermarkt.py
if errorlevel 1 (
    echo.
    echo !!! Stahovani se nedokoncilo. Postup je ulozeny - spust tento soubor znovu pozdeji.
    goto konec
)

git diff --quiet -- data/tm_data.json
if not errorlevel 1 (
    echo.
    echo Udaje se nezmenily, neni co posilat.
    goto konec
)

echo.
choice /c AN /m "Poslat nove udaje z Transfermarktu na GitHub (a tim je zverejnit pro tym)?"
if errorlevel 2 (
    echo.
    echo Neposlano. Novy data\tm_data.json zustal jen u tebe v pocitaci.
    goto konec
)

for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set DNES=%%d
git add data/tm_data.json
git commit -m "Aktualizace udaju z Transfermarktu (%DNES%)"
git push
if errorlevel 1 (
    echo.
    echo !!! Odeslani na GitHub selhalo. Udaje jsou ulozene jen u tebe.
    goto konec
)
echo.
echo Hotovo. Vercel za par minut nasadi novou verzi aplikace.

:konec
echo.
pause
