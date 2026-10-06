@echo off
setlocal
if exist "%~dp0gradle\wrapper\gradle-wrapper.jar" (
  java -classpath "%~dp0gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*
  exit /b %ERRORLEVEL%
)
if defined KNABA_GRADLE_HOME (
  call "%KNABA_GRADLE_HOME%\bin\gradle.bat" -p "%~dp0" %*
  exit /b %ERRORLEVEL%
)
echo BLOCKED_EXTERNAL: provision Gradle 8.13 and Android SDK 36, then generate the official wrapper JAR.
exit /b 69
