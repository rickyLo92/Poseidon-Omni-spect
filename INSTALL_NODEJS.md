# Installing Node.js

This project requires Node.js and npm to run. If you're seeing an error when running `run.bat`, you need to install Node.js first.

## Quick Installation Options

### Option 1: Download from Official Website (Recommended)
1. Go to **https://nodejs.org/**
2. Download the **LTS (Long Term Support)** version
3. Run the installer and follow the setup wizard
4. **IMPORTANT:** Make sure "Add to PATH" is checked during installation
5. **RESTART YOUR COMPUTER** after installation (this is critical!)
6. Open a **NEW** Command Prompt or PowerShell window
7. Double-click `run.bat` again

### Option 2: Using Winget (Windows Package Manager)
If you have Windows 10/11 with winget installed:
```powershell
winget install OpenJS.NodeJS.LTS
```
Then restart your computer and try `run.bat` again.

### Option 3: Using Chocolatey
If you have Chocolatey installed:
```powershell
choco install nodejs-lts
```
Then restart your computer and try `run.bat` again.

## Verify Installation

After installing Node.js, open a new Command Prompt or PowerShell window and run:
```bash
node --version
npm --version
```

You should see version numbers. If you still get errors, make sure to:
1. **Restart your computer** after installation
2. Open a **new** terminal window (don't use an old one)
3. Try running the commands again

## Manual Setup (Alternative)

If you prefer to run commands manually instead of using `run.bat`:

1. Open Command Prompt or PowerShell in the project folder
2. Run: `npm install`
3. Run: `npm run dev`
4. Open your browser to `http://localhost:5173`

## Troubleshooting

**Problem**: npm is still not recognized after installation
- **Solution**: **RESTART YOUR COMPUTER** (this fixes most PATH issues)

**Problem**: Permission errors during installation
- **Solution**: Run Command Prompt or PowerShell as Administrator

**Problem**: Installation fails
- **Solution**: Make sure you have internet connection and try again

