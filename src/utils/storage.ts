import { Annotation, STORAGE_KEY, ProjectFile } from '../types';
import { legacyBoxToWorldDirection } from './annotationGeometry';

/**
 * Migrates legacy annotations (with box but no worldDirection) to world-space annotations.
 * This is a best-effort migration that approximates world direction from box center.
 * 
 * @param annotations Array of annotations to migrate
 * @returns Migrated annotations with worldDirection set
 */
export function migrateLegacyAnnotations(annotations: Annotation[]): Annotation[] {
  return annotations.map((ann) => {
    // If annotation already has worldDirection, no migration needed
    if (ann.worldDirection) {
      return ann;
    }

    // If annotation has box coordinates but no worldDirection, migrate it
    if (ann.box) {
      // Use the legacy migration function to approximate world direction
      // Note: This is approximate since we don't have the exact camera state when created
      const worldDirection = legacyBoxToWorldDirection(ann.box, ann.cameraRotation);
      
      return {
        ...ann,
        worldDirection,
        // Keep box for backwards compatibility and screenshot purposes
      };
    }

    // No migration possible, return as-is
    return ann;
  });
}

/**
 * Load all annotations from localStorage.
 * Returns an empty array if no annotations are found or if parsing fails.
 * Automatically migrates legacy annotations to world-space format.
 */
export function loadAnnotations(): Annotation[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const annotations = JSON.parse(stored) as Annotation[];
    
    // Migrate legacy annotations
    const migrated = migrateLegacyAnnotations(annotations);
    
    // Save migrated annotations back if any were migrated
    const needsSaving = migrated.some((ann, i) => 
      !annotations[i].worldDirection && ann.worldDirection
    );
    if (needsSaving) {
      saveAnnotations(migrated);
    }
    
    return migrated;
  } catch (error) {
    console.error('Failed to load annotations from localStorage:', error);
    return [];
  }
}

/**
 * Save annotations to localStorage.
 * Overwrites any existing annotations.
 */
export function saveAnnotations(annotations: Annotation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
  } catch (error) {
    console.error('Failed to save annotations to localStorage:', error);
  }
}

/**
 * Format video time in seconds to mm:ss format
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Extract directory path from a file path
 * Works with both Windows (\) and Unix (/) path separators
 */
export function getDirectoryFromPath(filePath: string): string {
  // Handle both Windows and Unix path separators
  const lastSeparator = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (lastSeparator === -1) {
    return ''; // No directory, just filename
  }
  return filePath.substring(0, lastSeparator);
}

/**
 * Get the deliverables folder path (video directory + /deliverables)
 */
export function getDeliverablesFolderPath(videoPath: string): string {
  const videoDirectory = getDirectoryFromPath(videoPath);
  if (!videoDirectory) {
    return 'deliverables'; // Fallback if no directory
  }
  // Use the same path separator as the video path
  const pathSeparator = videoPath.includes('\\') ? '\\' : '/';
  return `${videoDirectory}${pathSeparator}deliverables`;
}

/**
 * Ensure the deliverables folder exists
 */
export async function ensureDeliverablesFolder(videoPath: string): Promise<string> {
  const deliverablesPath = getDeliverablesFolderPath(videoPath);
  
  if (window.electronAPI && window.electronAPI.ensureDirectoryExists) {
    try {
      await window.electronAPI.ensureDirectoryExists(deliverablesPath);
    } catch (error) {
      console.error('Failed to create deliverables folder:', error);
      throw error;
    }
  }
  
  return deliverablesPath;
}

/**
 * Save a screenshot to a file (works in Electron or browser)
 * @param screenshotDataUrl Base64 data URL of the screenshot
 * @param annotationId ID of the annotation
 * @param videoFileName Name of the video file
 * @param directory Optional directory path (if provided, saves to that directory)
 */
export async function saveScreenshotToFile(
  screenshotDataUrl: string,
  annotationId: string,
  videoFileName: string,
  directory?: string
): Promise<void> {
  try {
    // Check if we're in Electron
    if (window.electronAPI && window.electronAPI.saveScreenshot) {
      // Convert data URL to base64, then to buffer
      const base64Data = screenshotDataUrl.split(',')[1]; // Remove data:image/png;base64, prefix
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Create Buffer-like object for Electron
      // In Electron renderer, we can use Buffer directly if available
      let buffer: any;
      if (typeof Buffer !== 'undefined') {
        buffer = Buffer.from(bytes);
      } else {
        // Fallback: pass as Uint8Array and let Electron handle it
        buffer = bytes;
      }
      
      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `annotation-${annotationId}-${timestamp}.png`;
      
      // Pass directory and filename separately to Electron API
      // This allows Electron to handle path construction correctly
      if (directory) {
        // Ensure the directory exists before saving
        if (window.electronAPI && window.electronAPI.ensureDirectoryExists) {
          await window.electronAPI.ensureDirectoryExists(directory);
        }
      }
      await window.electronAPI.saveScreenshot(filename, buffer, directory);
    } else {
      // Browser fallback: download the image
      const link = document.createElement('a');
      link.href = screenshotDataUrl;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `annotation-${annotationId}-${timestamp}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } catch (error) {
    console.error('Failed to save screenshot:', error);
    throw error;
  }
}

/**
 * Save annotations to CSV file
 * @param annotations Array of annotations to export
 * @param videoFileName Name of the video file
 * @param directory Optional directory path (if provided, saves to that directory)
 */
export async function saveAnnotationsToCSV(
  annotations: Annotation[],
  videoFileName: string,
  directory?: string
): Promise<void> {
  try {
    // CSV header - new format
    const headers = [
      'Defect Number',
      'Time Stamp',
      'Primary Description',
      'Secondary Description',
      'Grade',
      'DROPS',
      'Risk Index',
      'Notes',
      'Colour',
      'Screenshot Name',
    ];
    
    // CSV rows - new format
    const rows = annotations.map((ann, index) => {
      // Generate screenshot filename (same pattern as in saveScreenshotToFile)
      const timestamp = new Date(ann.createdAt).toISOString().replace(/[:.]/g, '-');
      const screenshotName = `annotation-${ann.id}-${timestamp}.png`;
      
      // Get primary and secondary descriptions (with fallback to legacy description)
      const primaryDesc = ann.primaryDescription || (ann.description ? ann.description.split(' - ')[0] : '') || '';
      const secondaryDesc = ann.secondaryDescription || (ann.description && ann.description.includes(' - ') ? ann.description.split(' - ')[1] : '') || ann.description || '';
      
      return [
        (ann.defectNumber || index + 1).toString(),
        formatTime(ann.videoTime),
        `"${primaryDesc.replace(/"/g, '""')}"`, // Escape quotes in CSV
        `"${secondaryDesc.replace(/"/g, '""')}"`, // Escape quotes in CSV
        ann.grade === 'N/A' ? 'N/A' : (ann.grade?.toString() || ''),
        ann.drops === 'N/A' ? 'N/A' : (ann.drops?.toString() || ''),
        ann.riskIndex?.toString() || '',
        `"${(ann.notes || ann.label || '').replace(/"/g, '""')}"`, // Escape quotes in CSV, fallback to legacy label
        ann.colour,
        screenshotName,
      ];
    });
    
    // Combine header and rows
    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    
    // Check if we're in Electron
    if (window.electronAPI && window.electronAPI.saveCSV) {
      // Save using Electron API
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `annotations-${timestamp}.csv`;
      
      // Create buffer for CSV content
      let buffer: any;
      if (typeof Buffer !== 'undefined') {
        buffer = Buffer.from(csvContent, 'utf-8');
      } else {
        // Fallback: convert string to Uint8Array
        const encoder = new TextEncoder();
        buffer = encoder.encode(csvContent);
      }
      
      // Pass directory and filename separately to Electron API
      // This allows Electron to handle path construction correctly
      if (directory) {
        // Ensure the directory exists before saving
        if (window.electronAPI && window.electronAPI.ensureDirectoryExists) {
          await window.electronAPI.ensureDirectoryExists(directory);
        }
      }
      await window.electronAPI.saveCSV(filename, buffer, directory);
    } else {
      // Browser fallback: download the CSV
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `annotations-${timestamp}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    }
  } catch (error) {
    console.error('Failed to save CSV:', error);
    throw error;
  }
}

/**
 * Save project file (annotations, video reference, etc.)
 * Saves to the same directory as the video file
 */
export async function saveProjectFile(
  annotations: Annotation[],
  videoFileName: string,
  videoPath?: string
): Promise<string | null> {
  try {
    if (!window.electronAPI) {
      alert('Project saving is only available in Electron. Please use the Electron version of the application.');
      return null;
    }

    if (!window.electronAPI.saveProjectFile) {
      alert('Project saving is not available. Please update your Electron application.');
      return null;
    }

    if (!videoPath) {
      alert('Cannot save project: No video path available. Please load a video first.');
      return null;
    }

    const project: ProjectFile = {
      version: '1.0',
      videoFileName,
      videoPath,
      annotations,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    };

    const jsonContent = JSON.stringify(project, null, 2);
    
    // Create buffer for project file
    let buffer: any;
    if (typeof Buffer !== 'undefined') {
      buffer = Buffer.from(jsonContent, 'utf-8');
    } else {
      const encoder = new TextEncoder();
      buffer = encoder.encode(jsonContent);
    }

    // Generate project filename based on video filename
    const projectFileName = videoFileName.replace(/\.[^/.]+$/, '') + '.360annotator';
    
    // Get directory from video path and construct full path
    const directory = getDirectoryFromPath(videoPath);
    // Use the same path separator as the original path (Windows uses \, Unix uses /)
    const pathSeparator = videoPath.includes('\\') ? '\\' : '/';
    const fullPath = directory 
      ? `${directory}${pathSeparator}${projectFileName}`
      : projectFileName; // Fallback if no directory (shouldn't happen)

    await window.electronAPI.saveProjectFile(fullPath, buffer);
    
    // Add to recent projects
    if (window.electronAPI.addRecentProject) {
      await window.electronAPI.addRecentProject(fullPath, videoFileName);
    }

    return fullPath;
  } catch (error) {
    console.error('Failed to save project file:', error);
    alert(`Failed to save project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

/**
 * Load project file
 * @param filePath Optional file path to load directly (for recent projects)
 */
export async function loadProjectFile(filePath?: string): Promise<ProjectFile | null> {
  try {
    if (!window.electronAPI) {
      alert('Project loading is only available in Electron. Please use the Electron version of the application.');
      return null;
    }

    let result: { filePath: string; data: string } | null = null;

    // If filePath is provided, try to load it directly
    if (filePath && window.electronAPI.loadProjectFile) {
      result = await window.electronAPI.loadProjectFile(filePath);
    } else if (window.electronAPI.showOpenDialog) {
      // Use open dialog
      const selectedPath = await window.electronAPI.showOpenDialog({
        filters: [{ name: '360 Annotator Project', extensions: ['360annotator'] }],
      });
      
      if (selectedPath && window.electronAPI.loadProjectFile) {
        result = await window.electronAPI.loadProjectFile(selectedPath);
      }
    } else if (window.electronAPI.loadProjectFile) {
      // Fallback to loadProjectFile without path (should show dialog)
      result = await window.electronAPI.loadProjectFile();
    } else {
      alert('Project loading is not available. Please update your Electron application.');
      return null;
    }

    if (!result) {
      return null; // User cancelled
    }

    const project = JSON.parse(result.data) as ProjectFile;
    
    // Migrate legacy annotations in the project file
    if (project.annotations) {
      project.annotations = migrateLegacyAnnotations(project.annotations);
    }
    
    // Add to recent projects
    if (window.electronAPI.addRecentProject && result.filePath) {
      await window.electronAPI.addRecentProject(result.filePath, project.videoFileName);
    }

    return project;
  } catch (error) {
    console.error('Failed to load project file:', error);
    alert(`Failed to load project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

/**
 * Check for project file near video file
 */
export async function checkForProjectFile(videoPath: string): Promise<ProjectFile | null> {
  try {
    if (!window.electronAPI || !window.electronAPI.checkForProjectFile) {
      return null;
    }

    const projectFilePath = await window.electronAPI.checkForProjectFile(videoPath);
    if (!projectFilePath) {
      return null;
    }

    // Load the project file
    // We need to read it - for now, return a flag that indicates a file exists
    // The actual loading will be done via loadProjectFile with the path
    return null; // This is just a check - actual loading happens elsewhere
  } catch (error) {
    console.error('Failed to check for project file:', error);
    return null;
  }
}

