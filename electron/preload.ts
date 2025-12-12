const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  selectVideoFile: () => ipcRenderer.invoke('select-video-file'),
  getFilePath: (filePath: string) => ipcRenderer.invoke('get-file-path', filePath),
  platform: process.platform,
  saveScreenshot: (filename: string, buffer: Buffer | Uint8Array, directory?: string) => 
    ipcRenderer.invoke('save-screenshot', filename, buffer, directory),
  saveCSV: (filename: string, buffer: Buffer | Uint8Array, directory?: string) => 
    ipcRenderer.invoke('save-csv', filename, buffer, directory),
  ensureDirectoryExists: (directory: string) => 
    ipcRenderer.invoke('ensure-directory-exists', directory),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  saveProjectFile: (filePath: string, data: Buffer | Uint8Array) => 
    ipcRenderer.invoke('save-project-file', filePath, data),
  loadProjectFile: (filePath?: string) => ipcRenderer.invoke('load-project-file', filePath),
  showSaveDialog: (options: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => 
    ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options: { filters?: Array<{ name: string; extensions: string[] }> }) => 
    ipcRenderer.invoke('show-open-dialog', options),
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  addRecentProject: (filePath: string, name: string) => 
    ipcRenderer.invoke('add-recent-project', filePath, name),
  checkForProjectFile: (videoPath: string) => 
    ipcRenderer.invoke('check-for-project-file', videoPath),
  captureWindowScreenshot: (rect?: { x: number; y: number; width: number; height: number }) => 
    ipcRenderer.invoke('capture-window-screenshot', rect),
  savePDF: (filename: string, buffer: Buffer | Uint8Array, directory?: string) => 
    ipcRenderer.invoke('save-pdf', filename, buffer, directory),
  saveVideo: (filename: string, buffer: Buffer | Uint8Array, directory?: string) => 
    ipcRenderer.invoke('save-video', filename, buffer, directory),
});

