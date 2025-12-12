const electron = require('electron');
const { app, BrowserWindow, dialog, ipcMain } = electron;
const { join } = require('path');
const { readFile, writeFile, mkdir } = require('fs/promises');
const { existsSync } = require('fs');

let mainWindow: any = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(__dirname, '../dist-electron/preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allow file:// URLs for video loading
    },
    icon: join(__dirname, '../public/icon.png'),
  });

  // Load the app
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    // Wait a bit for Vite to be ready, then load
    const loadApp = () => {
      if (mainWindow) {
        mainWindow.loadURL('http://localhost:5173').catch((err) => {
          console.error('Failed to load URL:', err);
          // Retry after 2 seconds
          setTimeout(loadApp, 2000);
        });
        mainWindow.webContents.openDevTools();
      }
    };
    setTimeout(loadApp, 2000);
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }

  // Handle window errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', errorCode, errorDescription, 'URL:', validatedURL);
  });

  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`[Renderer ${level}]:`, message);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for file operations
ipcMain.handle('select-video-file', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  
  // Return file path - we'll use it directly instead of reading the file
  // This allows the renderer to use the file path with file:// protocol
  return {
    filePath: filePath,
    name: filePath.split(/[/\\]/).pop() || 'video',
  };
});

ipcMain.handle('get-file-path', async (_event, filePath: string) => {
  // Convert file path to file:// URL for use in video element
  // On Windows, we need to convert backslashes to forward slashes and handle drive letters
  let normalizedPath = filePath.replace(/\\/g, '/');
  
  // Windows drive letters need special handling (C:/ becomes /C:/)
  if (process.platform === 'win32' && /^[A-Z]:/.test(normalizedPath)) {
    normalizedPath = '/' + normalizedPath;
  }
  
  // Ensure we have the file:// protocol prefix
  const fileUrl = normalizedPath.startsWith('file://') ? normalizedPath : `file://${normalizedPath}`;
  
  console.log('Converting file path:', filePath, 'to URL:', fileUrl);
  return fileUrl;
});

// Get the annotations directory (in user's documents or app data)
function getAnnotationsDirectory(): string {
  const userDataPath = app.getPath('userData');
  const annotationsDir = join(userDataPath, 'annotations');
  
  // Create directory if it doesn't exist
  if (!existsSync(annotationsDir)) {
    mkdir(annotationsDir, { recursive: true }).catch(console.error);
  }
  
  return annotationsDir;
}

// Ensure directory exists (create if it doesn't)
ipcMain.handle('ensure-directory-exists', async (_event, directory: string) => {
  try {
    if (!existsSync(directory)) {
      await mkdir(directory, { recursive: true });
      console.log('Directory created:', directory);
    }
    return { success: true };
  } catch (error) {
    console.error('Failed to create directory:', error);
    throw error;
  }
});

// Save screenshot to file
ipcMain.handle('save-screenshot', async (_event, filename: string, buffer: Buffer | Uint8Array, directory?: string) => {
  try {
    // Use provided directory or fall back to default
    const targetDir = directory || getAnnotationsDirectory();
    
    // Ensure directory exists
    if (!existsSync(targetDir)) {
      await mkdir(targetDir, { recursive: true });
    }
    
    const filePath = join(targetDir, filename);
    // Convert Uint8Array to Buffer if needed
    const bufferToWrite = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    await writeFile(filePath, bufferToWrite);
    console.log('Screenshot saved to:', filePath);
    return { success: true, path: filePath };
  } catch (error) {
    console.error('Failed to save screenshot:', error);
    throw error;
  }
});

// Save CSV to file
ipcMain.handle('save-csv', async (_event, filename: string, buffer: Buffer | Uint8Array, directory?: string) => {
  try {
    // Use provided directory or fall back to default
    const targetDir = directory || getAnnotationsDirectory();
    
    // Ensure directory exists
    if (!existsSync(targetDir)) {
      await mkdir(targetDir, { recursive: true });
    }
    
    const filePath = join(targetDir, filename);
    // Convert Uint8Array to Buffer if needed, then to string
    const bufferToWrite = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    await writeFile(filePath, bufferToWrite, 'utf-8');
    console.log('CSV saved to:', filePath);
    return { success: true, path: filePath };
  } catch (error) {
    console.error('Failed to save CSV:', error);
    throw error;
  }
});

// Directory picker for exports
ipcMain.handle('select-directory', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// Save project file
ipcMain.handle('save-project-file', async (_event, filePath: string, data: Buffer | Uint8Array) => {
  try {
    // Ensure the directory exists
    const dir = require('path').dirname(filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    
    const bufferToWrite = Buffer.isBuffer(data) ? data : Buffer.from(data);
    await writeFile(filePath, bufferToWrite, 'utf-8');
    console.log('Project file saved to:', filePath);
    return { success: true, path: filePath };
  } catch (error) {
    console.error('Failed to save project file:', error);
    throw error;
  }
});

// Load project file
ipcMain.handle('load-project-file', async (_event, filePath?: string) => {
  try {
    let targetPath = filePath;
    
    // If no path provided, show open dialog
    if (!targetPath) {
      if (!mainWindow) return null;
      
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: '360 Annotator Project', extensions: ['360annotator'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      
      targetPath = result.filePaths[0];
    }
    
    const fileContent = await readFile(targetPath, 'utf-8');
    return { filePath: targetPath, data: fileContent };
  } catch (error) {
    console.error('Failed to load project file:', error);
    throw error;
  }
});

// Show save dialog
ipcMain.handle('show-save-dialog', async (_event, options: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
  if (!mainWindow) return null;

  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: options.defaultPath,
    filters: options.filters,
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  return result.filePath;
});

// Show open dialog
ipcMain.handle('show-open-dialog', async (_event, options: { filters?: Array<{ name: string; extensions: string[] }> }) => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: options.filters,
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// Recent projects management
const RECENT_PROJECTS_KEY = 'recentProjects';
const MAX_RECENT_PROJECTS = 10;

function getRecentProjects(): Array<{ filePath: string; name: string; lastOpened: number }> {
  try {
    const stored = app.getPath('userData');
    const recentFile = join(stored, 'recent-projects.json');
    if (existsSync(recentFile)) {
      const content = require('fs').readFileSync(recentFile, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Failed to load recent projects:', error);
  }
  return [];
}

function saveRecentProjects(projects: Array<{ filePath: string; name: string; lastOpened: number }>) {
  try {
    const stored = app.getPath('userData');
    const recentFile = join(stored, 'recent-projects.json');
    require('fs').writeFileSync(recentFile, JSON.stringify(projects, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save recent projects:', error);
  }
}

ipcMain.handle('get-recent-projects', async () => {
  return getRecentProjects();
});

ipcMain.handle('add-recent-project', async (_event, filePath: string, name: string) => {
  try {
    let projects = getRecentProjects();
    
    // Remove if already exists
    projects = projects.filter(p => p.filePath !== filePath);
    
    // Add to beginning
    projects.unshift({
      filePath,
      name,
      lastOpened: Date.now(),
    });
    
    // Keep only the most recent
    projects = projects.slice(0, MAX_RECENT_PROJECTS);
    
    saveRecentProjects(projects);
    return { success: true };
  } catch (error) {
    console.error('Failed to add recent project:', error);
    throw error;
  }
});

// Check for project file near video
ipcMain.handle('check-for-project-file', async (_event, videoPath: string) => {
  try {
    const path = require('path');
    const dir = path.dirname(videoPath);
    const videoName = path.basename(videoPath, path.extname(videoPath));
    const projectPath = path.join(dir, `${videoName}.360annotator`);
    
    if (existsSync(projectPath)) {
      return projectPath;
    }
    
    return null;
  } catch (error) {
    console.error('Failed to check for project file:', error);
    return null;
  }
});

// Capture screenshot of the current window
ipcMain.handle('capture-window-screenshot', async (_event, rect?: { x: number; y: number; width: number; height: number }) => {
  try {
    if (!mainWindow) {
      throw new Error('Main window not available');
    }

    // Capture the page - if rect is provided, we'll crop it, otherwise capture full window
    const image = await mainWindow.webContents.capturePage(rect);
    
    // Convert to PNG buffer
    const pngBuffer = image.toPNG();
    
    // Convert buffer to base64 data URL
    const base64 = pngBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;
    
    return dataUrl;
  } catch (error) {
    console.error('Failed to capture window screenshot:', error);
    throw error;
  }
});

// Save PDF file
ipcMain.handle('save-pdf', async (_event, filename: string, buffer: Buffer | Uint8Array, directory?: string) => {
  try {
    // Use provided directory or fall back to default
    const targetDir = directory || getAnnotationsDirectory();
    
    // Ensure directory exists
    if (!existsSync(targetDir)) {
      await mkdir(targetDir, { recursive: true });
    }
    
    const filePath = join(targetDir, filename);
    // Convert Uint8Array to Buffer if needed
    const bufferToWrite = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    await writeFile(filePath, bufferToWrite);
    console.log('PDF saved to:', filePath);
    return { success: true, path: filePath };
  } catch (error) {
    console.error('Failed to save PDF:', error);
    throw error;
  }
});

// Save video file
ipcMain.handle('save-video', async (_event, filename: string, buffer: Buffer | Uint8Array, directory?: string) => {
  try {
    // Use provided directory or fall back to default
    const targetDir = directory || getAnnotationsDirectory();
    
    // Ensure directory exists
    if (!existsSync(targetDir)) {
      await mkdir(targetDir, { recursive: true });
    }
    
    const filePath = join(targetDir, filename);
    // Convert Uint8Array to Buffer if needed
    const bufferToWrite = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    await writeFile(filePath, bufferToWrite);
    console.log('Video saved to:', filePath);
    return { success: true, path: filePath };
  } catch (error) {
    console.error('Failed to save video:', error);
    throw error;
  }
});

