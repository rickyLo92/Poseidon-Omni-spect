@echo off
echo ========================================
echo 360 Video Annotator - Backup Creator
echo ========================================
echo.

set BACKUP_DIR=%~dp0backups
set TIMESTAMP=%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set BACKUP_NAME=360-video-annotator-backup-%TIMESTAMP%

echo Creating backup directory...
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

echo.
echo Creating backup: %BACKUP_NAME%
echo.

echo Copying project files...
xcopy /E /I /Y /EXCLUDE:backup-exclude.txt "%CD%" "%BACKUP_DIR%\%BACKUP_NAME%" >nul 2>&1

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo Backup created successfully!
    echo Location: %BACKUP_DIR%\%BACKUP_NAME%
    echo ========================================
) else (
    echo.
    echo ========================================
    echo Creating ZIP archive instead...
    echo ========================================
    echo.
    
    powershell -Command "Compress-Archive -Path '%CD%\src','%CD%\electron','%CD%\package.json','%CD%\package-lock.json','%CD%\tsconfig.json','%CD%\vite.config.ts','%CD%\index.html','%CD%\*.md','%CD%\*.bat' -DestinationPath '%BACKUP_DIR%\%BACKUP_NAME%.zip' -Force"
    
    if %ERRORLEVEL% EQU 0 (
        echo.
        echo ========================================
        echo ZIP backup created successfully!
        echo Location: %BACKUP_DIR%\%BACKUP_NAME%.zip
        echo ========================================
    ) else (
        echo.
        echo ERROR: Failed to create backup
        echo Please create backup manually
    )
)

echo.
echo Backup process complete!
pause
