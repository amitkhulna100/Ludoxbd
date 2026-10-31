@echo off
setlocal enabledelayedexpansion

set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
set PATH=%JAVA_HOME%\bin;%PATH%
set ANDROID_SDK=C:\Users\hp\AppData\Local\Android\Sdk
set BUILD_TOOLS=%ANDROID_SDK%\build-tools\36.0.0
set PLATFORM=%ANDROID_SDK%\platforms\android-37.0\android.jar

echo [1/6] Inlining and bundling web assets with UTF-8...
javac android-build\BundleBuild.java
java -cp android-build BundleBuild
if errorlevel 1 goto error

echo [2/6] Compiling Java Activity...
if not exist android-build\build\classes mkdir android-build\build\classes
javac --release 17 -cp "%PLATFORM%" -d android-build\build\classes android-build\src\main\java\com\ludoxbd\game\MainActivity.java
if errorlevel 1 goto error

echo [3/6] Converting classes to DEX...
call "%BUILD_TOOLS%\d8.bat" --lib "%PLATFORM%" --output android-build\build android-build\build\classes\com\ludoxbd\game\*.class
if errorlevel 1 goto error

echo [4/6] Compiling resources and linking APK with AAPT2...
if not exist android-build\build\compiled_res mkdir android-build\build\compiled_res
"%BUILD_TOOLS%\aapt2.exe" compile --dir android-build\src\main\res -o android-build\build\compiled_res.zip
if errorlevel 1 goto error

"%BUILD_TOOLS%\aapt2.exe" link -o android-build\build\unaligned.apk -I "%PLATFORM%" --manifest android-build\src\main\AndroidManifest.xml -A android-build\build\assets android-build\build\compiled_res.zip --auto-add-overlay
if errorlevel 1 goto error

echo [5/6] Adding classes.dex to APK...
cd android-build\build
jar uf unaligned.apk classes.dex
cd ..\..

echo [6/6] Aligning and Signing APK...
if exist android-build\Ludo_X_BD.apk del android-build\Ludo_X_BD.apk
"%BUILD_TOOLS%\zipalign.exe" -v -p 4 android-build\build\unaligned.apk android-build\Ludo_X_BD.apk

call "%BUILD_TOOLS%\apksigner.bat" sign --ks debug.keystore --ks-pass pass:android --key-pass pass:android --out src\Ludo_X_BD.apk android-build\Ludo_X_BD.apk

echo ==============================================
echo APK BUILD SUCCESSFUL!
echo Output saved to src\Ludo_X_BD.apk
echo ==============================================
exit /b 0

:error
echo BUILD FAILED!
exit /b 1
