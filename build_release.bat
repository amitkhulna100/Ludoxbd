@echo off
setlocal enabledelayedexpansion

set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
set PATH=%JAVA_HOME%\bin;%PATH%
set ANDROID_SDK=C:\Users\hp\AppData\Local\Android\Sdk
set BUILD_TOOLS=%ANDROID_SDK%\build-tools\36.0.0
set PLATFORM=%ANDROID_SDK%\platforms\android-37.0\android.jar
set BUNDLETOOL=android-build\bundletool-all.jar

echo =========================================================
echo Ludo X BD - Google Play Official Release Build System
echo Target Android SDK: API 36 (Android 16)
echo =========================================================

if not exist release mkdir release
if not exist android-build\build mkdir android-build\build
if not exist android-build\build\classes mkdir android-build\build\classes
if not exist android-build\build\compiled_res mkdir android-build\build\compiled_res

REM 1. Load Keystore configuration
if not exist keystore.properties (
    echo [ERROR] keystore.properties not found!
    echo Please copy keystore.properties.example to keystore.properties and configure credentials.
    goto error
)

for /f "tokens=1,2 delims==" %%a in (keystore.properties) do (
    set "key=%%a"
    set "val=%%b"
    if "!key!"=="KEYSTORE_PATH" set KS_PATH=!val!
    if "!key!"=="KEYSTORE_PASSWORD" set KS_PASS=!val!
    if "!key!"=="KEY_ALIAS" set KEY_ALIAS=!val!
    if "!key!"=="KEY_PASSWORD" set KEY_PASS=!val!
)

if not exist "%KS_PATH%" (
    echo [ERROR] Upload Keystore file not found at: %KS_PATH%
    goto error
)

echo [1/8] Inlining and bundling web assets with UTF-8...
javac android-build\BundleBuild.java
if errorlevel 1 goto error
java -cp android-build BundleBuild
if errorlevel 1 goto error

echo [2/8] Compiling Java Activity (Target: Android 16 / API 36)...
javac --release 17 -cp "%PLATFORM%" -d android-build\build\classes android-build\src\main\java\com\ludoxbd\game\MainActivity.java
if errorlevel 1 goto error

echo [3/8] Converting classes to optimized DEX bytecode...
call "%BUILD_TOOLS%\d8.bat" --lib "%PLATFORM%" --output android-build\build android-build\build\classes\com\ludoxbd\game\*.class
if errorlevel 1 goto error

echo [4/8] Compiling resources with AAPT2...
"%BUILD_TOOLS%\aapt2.exe" compile --dir android-build\src\main\res -o android-build\build\compiled_res.zip
if errorlevel 1 goto error

echo [5/8] Building Release APK...
if exist android-build\build\unaligned_release.apk del android-build\build\unaligned_release.apk
"%BUILD_TOOLS%\aapt2.exe" link -o android-build\build\unaligned_release.apk -I "%PLATFORM%" --manifest android-build\src\main\AndroidManifest.xml -A android-build\build\assets android-build\build\compiled_res.zip --auto-add-overlay
if errorlevel 1 goto error

cd android-build\build
jar uf unaligned_release.apk classes.dex
cd ..\..

if exist android-build\build\aligned_release.apk del android-build\build\aligned_release.apk
"%BUILD_TOOLS%\zipalign.exe" -v -p 4 android-build\build\unaligned_release.apk android-build\build\aligned_release.apk
if errorlevel 1 goto error

call "%BUILD_TOOLS%\apksigner.bat" sign --ks "%KS_PATH%" --ks-pass "pass:%KS_PASS%" --key-pass "pass:%KEY_PASS%" --out release\Ludo_X_BD_release.apk android-build\build\aligned_release.apk
if errorlevel 1 goto error
echo [SUCCESS] Signed Release APK: release\Ludo_X_BD_release.apk

echo [6/8] Compiling Protocol Buffer Manifest and Resources for App Bundle...
if exist android-build\build\proto.apk del android-build\build\proto.apk
"%BUILD_TOOLS%\aapt2.exe" link --proto-format -o android-build\build\proto.apk -I "%PLATFORM%" --manifest android-build\src\main\AndroidManifest.xml android-build\build\compiled_res.zip --auto-add-overlay
if errorlevel 1 goto error

echo [7/8] Assembling base module ZIP...
java -cp android-build BundleBuild package-bundle
if errorlevel 1 goto error

echo [8/8] Generating and Signing Android App Bundle (.aab) with Google BundleTool...
if exist release\Ludo_X_BD_unsigned.aab del release\Ludo_X_BD_unsigned.aab
if exist release\Ludo_X_BD_release.aab del release\Ludo_X_BD_release.aab

java -jar "%BUNDLETOOL%" build-bundle --modules=android-build\build\base.zip --output=release\Ludo_X_BD_unsigned.aab
if errorlevel 1 goto error

echo Signing AAB with Upload Keystore...
jarsigner -keystore "%KS_PATH%" -storepass "%KS_PASS%" -keypass "%KEY_PASS%" release\Ludo_X_BD_unsigned.aab "%KEY_ALIAS%"
if errorlevel 1 goto error

move /Y release\Ludo_X_BD_unsigned.aab release\Ludo_X_BD_release.aab

echo Validating App Bundle for Google Play Store upload...
java -jar "%BUNDLETOOL%" validate --bundle=release\Ludo_X_BD_release.aab
if errorlevel 1 goto error

echo =========================================================
echo GOOGLE PLAY RELEASE BUILD SUCCESSFUL!
echo =========================================================
echo 1. Google Play Console Upload File (.aab):
echo    release\Ludo_X_BD_release.aab
echo.
echo 2. Direct Device Testing APK (.apk):
echo    release\Ludo_X_BD_release.apk
echo =========================================================
exit /b 0

:error
echo =========================================================
echo BUILD FAILED! Please check logs above.
echo =========================================================
exit /b 1
