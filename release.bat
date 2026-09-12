@echo off
chcp 1251 > nul
setlocal

echo ============================================
echo   Cuckoo Code - Publikatsiya obnovleniya
echo ============================================
echo.
echo  Versiya budet avtomaticheski uvelichena CI.
echo  Prosto vvedite kommentariy k izmeneniyam.
echo.

cd /d "%~dp0"

:: Proverit chto est izmeneniya
git status --short
echo.

:: Vvesti soobshchenie kommita
set /p MSG=Kommentariy k komitu (Enter = "update"): 

if "%MSG%"=="" set MSG=update

echo.
echo ==== 1/3 Dobavit vse izmeneniya ====
git add -A
if errorlevel 1 (
  echo Oshibka git add!
  pause
  exit /b 1
)

echo.
echo ==== 2/3 Commit: %MSG% ====
git commit -m "%MSG%"
if errorlevel 1 (
  echo Nechego kommitit - net izmeneniy!
  pause
  exit /b 1
)

echo.
echo ==== 3/3 Push na GitHub (master) ====
git push origin master
if errorlevel 1 (
  echo Push ne udalsya! Proverte set ili proksi.
  pause
  exit /b 1
)

echo.
echo ============================================
echo  Uspeshno! GitHub Actions avtomaticheski:
echo    1. Uvelichit patch-versiyu (+1)
echo    2. Sozdat tag vX.Y.Z
echo    3. Soberet i opublikuet reliz
echo.
echo  Progress: https://github.com/merfiDEV/Cookie-code/actions
echo  Relizy:   https://github.com/merfiDEV/Cookie-code/releases
echo ============================================
echo.
pause