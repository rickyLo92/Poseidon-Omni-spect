const { contextBridge, ipcRenderer } = require('electron');
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    selectVideoFile: () => ipcRenderer.invoke('select-video-file'),
    getFilePath: (filePath) => ipcRenderer.invoke('get-file-path', filePath),
    platform: process.platform,
    saveScreenshot: (filename, buffer, directory) => ipcRenderer.invoke('save-screenshot', filename, buffer, directory),
    saveCSV: (filename, buffer, directory) => ipcRenderer.invoke('save-csv', filename, buffer, directory),
    ensureDirectoryExists: (directory) => ipcRenderer.invoke('ensure-directory-exists', directory),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    saveProjectFile: (filePath, data) => ipcRenderer.invoke('save-project-file', filePath, data),
    loadProjectFile: (filePath) => ipcRenderer.invoke('load-project-file', filePath),
    showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
    getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
    addRecentProject: (filePath, name) => ipcRenderer.invoke('add-recent-project', filePath, name),
    checkForProjectFile: (videoPath) => ipcRenderer.invoke('check-for-project-file', videoPath),
    captureWindowScreenshot: (rect) => ipcRenderer.invoke('capture-window-screenshot', rect),
    savePDF: (filename, buffer, directory) => ipcRenderer.invoke('save-pdf', filename, buffer, directory),
    saveVideo: (filename, buffer, directory) => ipcRenderer.invoke('save-video', filename, buffer, directory),
});
