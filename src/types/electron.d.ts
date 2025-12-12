// Type definitions for Electron API exposed via preload script
export interface ElectronAPI {
  selectVideoFile: () => Promise<{ filePath: string; name: string } | null>;
  getFilePath: (filePath: string) => Promise<string>;
  platform: string;
  saveScreenshot: (filename: string, buffer: Buffer | Uint8Array, directory?: string) => Promise<void>;
  saveCSV: (filename: string, buffer: Buffer | Uint8Array, directory?: string) => Promise<void>;
  // Ensure directory exists (create if it doesn't)
  ensureDirectoryExists: (directory: string) => Promise<void>;
  // Directory picker for exports
  selectDirectory: () => Promise<string | null>;
  // Project file operations
  saveProjectFile: (filePath: string, data: Buffer | Uint8Array) => Promise<void>;
  loadProjectFile: (filePath?: string) => Promise<{ filePath: string; data: string } | null>;
  // Save file dialog (for project files)
  showSaveDialog: (options: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string | null>;
  // Open file dialog (for project files)
  showOpenDialog: (options: { filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string | null>;
  // Recent projects
  getRecentProjects: () => Promise<Array<{ filePath: string; name: string; lastOpened: number }>>;
  addRecentProject: (filePath: string, name: string) => Promise<void>;
  // Check for project file near video
  checkForProjectFile: (videoPath: string) => Promise<string | null>;
  // Capture screenshot of the current window
  captureWindowScreenshot: (rect?: { x: number; y: number; width: number; height: number }) => Promise<string>;
  // Save PDF file
  savePDF: (filename: string, buffer: Buffer | Uint8Array, directory?: string) => Promise<void>;
  // Save video file
  saveVideo: (filename: string, buffer: Buffer | Uint8Array, directory?: string) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}


