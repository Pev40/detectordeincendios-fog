@echo off
setlocal enabledelayedexpansion

REM Configurar variables
set ANDROID_SDK_ROOT=C:\Users\pevv2\AppData\Local\Android\Sdk
set AVD_NAME=FireIDApp_Emulator
set SYSTEM_IMAGE=system-images/android-36/google_apis/x86_64

REM Crear el AVD
echo Creando Android Virtual Device...
"%ANDROID_SDK_ROOT%\cmdline-tools\latest\bin\avdmanager.bat" create avd ^
  -n %AVD_NAME% ^
  -k "%SYSTEM_IMAGE%" ^
  -d "Nexus 5" ^
  --force

REM Iniciar el emulador
echo Iniciando emulador...
"%ANDROID_SDK_ROOT%\emulator\emulator.exe" -avd %AVD_NAME% -no-snapshot-load &

REM Esperar a que se inicie
echo Esperando a que el emulador se inicie (esto puede tardar 1-2 minutos)...
timeout /t 30

REM Instalar la app
cd C:\FireIDApp
npm run android
