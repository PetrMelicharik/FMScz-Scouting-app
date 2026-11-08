@echo off
rem ==========================================================================
rem  Aktualizace databaze hracu FM Scouts - spust dvojklikem.
rem
rem  Co se stane:
rem   1. Stahnou se novinky z GitHubu (git pull).
rem   2. Python skript prevezme nova CSV ze Stazenych souboru, sestavi
rem      data\db.xlsx a vypise prehled lig.
rem   3. Po tvem potvrzeni se db.xlsx posle na GitHub. Tim se spusti
rem      stazeni fotek/formy (GitHub Actions) a nove nasazeni na Vercelu.
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

py python\build_db.py --import
if errorlevel 1 (
    echo.
    echo !!! Databaze se nevytvorila, na GitHub nic neposilam.
    goto konec
)

rem Zmenil se vubec db.xlsx?
git diff --quiet -- data/db.xlsx
if not errorlevel 1 (
    echo.
    echo Databaze je stejna jako na GitHubu, neni co posilat.
    goto konec
)

echo.
choice /c AN /m "Poslat novou databazi na GitHub (a tim ji zverejnit pro tym)?"
if errorlevel 2 (
    echo.
    echo Neposlano. Novy data\db.xlsx zustal jen u tebe v pocitaci.
    goto konec
)

for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set DNES=%%d
git add data/db.xlsx
git commit -m "Aktualizace databaze hracu (%DNES%)"
git push
if errorlevel 1 (
    echo.
    echo !!! Odeslani na GitHub selhalo. Databaze je ulozena jen u tebe.
    goto konec
)
echo.
echo Hotovo. Fotky a forma hracu se stahnou automaticky a Vercel za par minut nasadi novou verzi.

:konec
echo.
pause
