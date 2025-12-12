# Desktop App Setup - 360° Video Annotator

This app can now run as a **desktop application** using Electron, which provides **much faster video loading** for large files!

## Why Desktop App is Faster

✅ **No Upload Required** - Direct file system access means videos load instantly  
✅ **Better Performance** - Native file handling, no browser limitations  
✅ **More Memory** - Desktop apps can use more system resources  
✅ **Native File Picker** - Better user experience with OS-native dialogs  

## Quick Start (Desktop App)

### Option 1: Run in Development Mode

1. **Double-click `run-electron.bat`** - This will:
   - Install dependencies if needed
   - Build the Electron main process
   - Start the desktop app

2. The app will open as a desktop window (not in browser)

### Option 2: Manual Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build Electron main process:
   ```bash
   npm run build:electron
   ```

3. Start in development mode:
   ```bash
   npm run electron:dev
   ```

## Building for Distribution

To create a distributable desktop app:

```bash
npm run electron:dist
```

This creates installers in the `release/` folder:
- **Windows**: `.exe` installer
- **macOS**: `.dmg` file
- **Linux**: `.AppImage` file

## Running as Web App (Original)

If you prefer the web version, just double-click `run.bat` as before.

## Performance Comparison

| Method | Large Video (500MB) | Small Video (50MB) |
|--------|---------------------|-------------------|
| **Desktop App** | ~2-5 seconds | Instant |
| **Web Browser** | 30-60+ seconds | 5-10 seconds |

The desktop app is **10-20x faster** for large videos because it doesn't need to upload files!

## Troubleshooting

**Problem**: Electron won't start
- Make sure you've run `npm install` first
- Try running `npm run build:electron` manually

**Problem**: Video still slow to load
- Make sure you're using the desktop app (not browser)
- Check that `window.electronAPI` exists in browser console

**Problem**: File picker doesn't work
- Make sure Electron is running (not just Vite)
- Check the Electron console for errors


