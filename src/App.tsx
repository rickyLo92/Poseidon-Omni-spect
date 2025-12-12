import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Video360Player } from './components/Video360Player';
import { AnnotationOverlay } from './components/AnnotationOverlay';
import { AnnotationList } from './components/AnnotationList';
import { HighlightVideoPlayer } from './components/HighlightVideoPlayer';
import { Annotation } from './types';
import { loadAnnotations, saveAnnotations, saveScreenshotToFile, saveAnnotationsToCSV, saveProjectFile, loadProjectFile, ensureDeliverablesFolder } from './utils/storage';
import { generatePDFReport } from './utils/pdfReport';

/**
 * Main App component that wires everything together.
 * 
 * Responsibilities:
 * - Manages annotation state and localStorage persistence
 * - Coordinates between video player, overlay, and annotation list
 * - Handles annotation creation, deletion, and seeking
 */
function App() {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [seekFunction, setSeekFunction] = useState<((time: number) => void) | null>(null);
  const [restoreCameraViewFunction, setRestoreCameraViewFunction] = useState<((phi: number, theta: number) => void) | null>(null);
  const [getCameraRotationFunction, setGetCameraRotationFunction] = useState<(() => { phi: number; theta: number } | null) | null>(null);
  const [getCameraFunction, setGetCameraFunction] = useState<(() => THREE.PerspectiveCamera | null) | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [videoPath, setVideoPath] = useState<string | undefined>(undefined);
  const [seekToTime, setSeekToTime] = useState<{ time: number; cameraRotation?: { phi: number; theta: number } } | null>(null);
  const [recentProjects, setRecentProjects] = useState<Array<{ filePath: string; name: string; lastOpened: number }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load annotations from localStorage on mount
  useEffect(() => {
    const loaded = loadAnnotations();
    setAnnotations(loaded);
  }, []);

  // Save annotations to localStorage whenever they change
  useEffect(() => {
    saveAnnotations(annotations);
  }, [annotations]);

  // Note: Screenshots and CSV are now only saved when explicitly exported by the user
  // This prevents automatic file creation and allows users to choose where to save

  // Update viewport size
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setViewportSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Handle video ready callback
  const handleVideoReady = (video: HTMLVideoElement, seek: (time: number) => void, restoreCameraView: (phi: number, theta: number) => void, getCameraRotation: () => { phi: number; theta: number } | null, getCamera: () => THREE.PerspectiveCamera | null) => {
    setVideoElement(video);
    setSeekFunction(() => seek);
    setRestoreCameraViewFunction(() => restoreCameraView);
    setGetCameraRotationFunction(() => getCameraRotation);
    setGetCameraFunction(() => getCamera);
  };

  // Pause video function
  const handlePauseVideo = () => {
    if (videoElement && !videoElement.paused) {
      videoElement.pause();
    }
  };

  // Get camera rotation function
  const handleGetCameraRotation = (): { phi: number; theta: number } | null => {
    return getCameraRotationFunction ? getCameraRotationFunction() : null;
  };

  // Get camera function
  const handleGetCamera = (): THREE.PerspectiveCamera | null => {
    return getCameraFunction ? getCameraFunction() : null;
  };

  // Handle time updates from video
  const handleTimeUpdate = (time: number) => {
    setCurrentVideoTime(time);
  };

  // Handle new annotation creation
  const handleAnnotationCreate = async (annotationData: Omit<Annotation, 'id' | 'createdAt'>) => {
    const newAnnotation: Annotation = {
      ...annotationData,
      id: `ann-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    };

    setAnnotations((prev) => [...prev, newAnnotation]);

    // Automatically save screenshot when annotation is created to deliverables folder
    if (newAnnotation.screenshotDataUrl && videoPath) {
      try {
        // Ensure deliverables folder exists and get its path
        const deliverablesPath = await ensureDeliverablesFolder(videoPath);
        await saveScreenshotToFile(
          newAnnotation.screenshotDataUrl,
          newAnnotation.id,
          videoFileName,
          deliverablesPath
        );
      } catch (error) {
        console.error('Failed to automatically save screenshot:', error);
        // Don't show alert - just log it, as this is automatic
      }
    }
  };

  // Handle annotation deletion
  const handleAnnotationDelete = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((ann) => ann.id !== id));
  }, []);

  // Track if video should be paused (when annotation is clicked)
  const [shouldStayPaused, setShouldStayPaused] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showHighlightPlayer, setShowHighlightPlayer] = useState(false);
  // Track the currently selected annotation (the one user clicked on)
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);

  // Handle annotation click (seek to timestamp and restore camera view, pause video)
  const handleAnnotationClick = (annotation: Annotation) => {
    if (seekFunction && restoreCameraViewFunction) {
      // Set the selected annotation ID
      setSelectedAnnotationId(annotation.id);
      
      // Set flag to keep video paused
      setShouldStayPaused(true);
      
      // Pause video immediately
      if (videoElement && !videoElement.paused) {
        videoElement.pause();
      }
      
      // Set seek state to trigger seek and pause in Video360Player
      setSeekToTime({
        time: annotation.videoTime,
        cameraRotation: annotation.cameraRotation,
      });
      
      // Seek to the annotation's timestamp
      seekFunction(annotation.videoTime);
      
      // Restore camera view after a brief delay to ensure video has seeked
      // This ensures the camera rotation is restored to show the annotation at the exact location
      setTimeout(() => {
        if (annotation.cameraRotation) {
          restoreCameraViewFunction(annotation.cameraRotation.phi, annotation.cameraRotation.theta);
        }
      }, 100);
      
      // Clear seekToTime after a moment to allow re-seeking to same annotation
      setTimeout(() => {
        setSeekToTime(null);
      }, 300);
    }
  };

  // Clear selected annotation when play is clicked
  const handlePlayClick = useCallback(() => {
    setShouldStayPaused(false);
    setSelectedAnnotationId(null); // Clear selected annotation when resuming playback
  }, []);


  // Load recent projects on mount
  useEffect(() => {
    const loadRecentProjects = async () => {
      if (window.electronAPI && window.electronAPI.getRecentProjects) {
        try {
          const recent = await window.electronAPI.getRecentProjects();
          setRecentProjects(recent);
        } catch (error) {
          console.error('Failed to load recent projects:', error);
        }
      }
    };
    loadRecentProjects();
  }, []);

  // Handle re-export screenshots (screenshots are automatically saved, but this allows re-exporting)
  const handleExportScreenshots = async () => {
    if (annotations.length === 0) {
      alert('No annotations to export.');
      return;
    }
    
    if (!videoPath) {
      alert('No video loaded. Please load a video first.');
      return;
    }
    
    try {
      // Ensure deliverables folder exists and get its path
      const deliverablesPath = await ensureDeliverablesFolder(videoPath);

      let exportedCount = 0;
      for (const annotation of annotations) {
        if (annotation.screenshotDataUrl) {
          await saveScreenshotToFile(annotation.screenshotDataUrl, annotation.id, videoFileName, deliverablesPath);
          exportedCount++;
        }
      }
      alert(`Re-exported ${exportedCount} screenshot(s) successfully to the deliverables folder.`);
    } catch (error) {
      console.error('Failed to re-export screenshots:', error);
      alert(`Failed to re-export screenshots: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle export CSV
  const handleExportCSV = async () => {
    if (annotations.length === 0) {
      alert('No annotations to export.');
      return;
    }
    
    if (!videoPath) {
      alert('No video loaded. Please load a video first.');
      return;
    }
    
    try {
      // Ensure deliverables folder exists and get its path
      const deliverablesPath = await ensureDeliverablesFolder(videoPath);

      await saveAnnotationsToCSV(annotations, videoFileName, deliverablesPath);
      alert('CSV exported successfully to the deliverables folder.');
    } catch (error) {
      console.error('Failed to export CSV:', error);
      alert(`Failed to export CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle generate PDF report
  const handleGeneratePDFReport = async () => {
    if (annotations.length === 0) {
      alert('No annotations to include in report.');
      return;
    }

    if (!videoPath) {
      alert('No video loaded. Please load a video first.');
      return;
    }

    try {
      await generatePDFReport(annotations, videoFileName, videoPath);
    } catch (error) {
      console.error('Failed to generate PDF report:', error);
      alert(`Failed to generate PDF report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle save project
  const handleSaveProject = async () => {
    if (!videoUrl || annotations.length === 0) {
      alert('No project to save. Please load a video and create some annotations first.');
      return;
    }

    try {
      const projectPath = await saveProjectFile(annotations, videoFileName, videoPath);
      if (projectPath) {
        alert('Project saved successfully!');
        // Reload recent projects
        if (window.electronAPI && window.electronAPI.getRecentProjects) {
          const recent = await window.electronAPI.getRecentProjects();
          setRecentProjects(recent);
        }
      }
    } catch (error) {
      console.error('Failed to save project:', error);
      alert('Failed to save project. Please check the console for details.');
    }
  };

  // Handle load project
  const handleLoadProject = async () => {
    try {
      const project = await loadProjectFile();
      if (!project) {
        return; // User cancelled
      }

      // Load the project
      setAnnotations(project.annotations);
      setVideoFileName(project.videoFileName);
      
      // Try to load the video
      if (project.videoPath && window.electronAPI) {
        try {
          const fileUrl = await window.electronAPI.getFilePath(project.videoPath);
          setVideoUrl(fileUrl);
          setVideoPath(project.videoPath);
          
          // Create deliverables folder when loading project
          try {
            await ensureDeliverablesFolder(project.videoPath);
            console.log('Deliverables folder created/verified');
          } catch (error) {
            console.error('Failed to create deliverables folder:', error);
          }
        } catch (error) {
          console.error('Failed to load video from project:', error);
          alert('Project loaded, but video file could not be found. Please select the video file manually.');
        }
      } else {
        // Ask user to select video file
        alert('Please select the video file to continue.');
        handleVideoFileSelect();
      }

      // Reload recent projects
      if (window.electronAPI && window.electronAPI.getRecentProjects) {
        const recent = await window.electronAPI.getRecentProjects();
        setRecentProjects(recent);
      }
    } catch (error) {
      console.error('Failed to load project:', error);
      alert('Failed to load project. Please check the console for details.');
    }
  };

  // Handle load recent project
  const handleLoadRecentProject = async (projectPath: string) => {
    try {
      const project = await loadProjectFile(projectPath);
      if (!project) {
        return;
      }

      setAnnotations(project.annotations);
      setVideoFileName(project.videoFileName);
      
      // Try to load the video
      if (project.videoPath && window.electronAPI) {
        try {
          const fileUrl = await window.electronAPI.getFilePath(project.videoPath);
          setVideoUrl(fileUrl);
          setVideoPath(project.videoPath);
          
          // Create deliverables folder when loading project
          try {
            await ensureDeliverablesFolder(project.videoPath);
            console.log('Deliverables folder created/verified');
          } catch (error) {
            console.error('Failed to create deliverables folder:', error);
          }
        } catch (error) {
          console.error('Failed to load video from project:', error);
          alert('Project loaded, but video file could not be found. Please select the video file manually.');
        }
      } else {
        // Ask user to select video file
        alert('Please select the video file to continue.');
        handleVideoFileSelect();
      }

      // Reload recent projects
      if (window.electronAPI && window.electronAPI.getRecentProjects) {
        const recent = await window.electronAPI.getRecentProjects();
        setRecentProjects(recent);
      }

      setShowFileMenu(false);
    } catch (error) {
      console.error('Failed to load recent project:', error);
      alert('Failed to load project. Please check the console for details.');
    }
  };

  // Handle video file selection
  const handleVideoFileSelect = async (event?: React.ChangeEvent<HTMLInputElement>) => {
    // Check if we're in Electron
    if (window.electronAPI) {
      try {
        // Use Electron's native file picker
        const result = await window.electronAPI.selectVideoFile();
        if (result) {
          // Check for project file
          if (window.electronAPI.checkForProjectFile) {
            const projectFilePath = await window.electronAPI.checkForProjectFile(result.filePath);
            if (projectFilePath) {
              const shouldLoad = window.confirm(
                'A saved project file was found for this video. Would you like to load the saved annotations and continue from where you left off?'
              );
              
              if (shouldLoad) {
                try {
                  // Load the project file using the found path
                  const project = await loadProjectFile(projectFilePath);
                  if (project) {
                    setAnnotations(project.annotations);
                    setVideoFileName(project.videoFileName || result.name);
                    setVideoPath(result.filePath);
                    
                    // Get file:// URL for the video
                    const fileUrl = await window.electronAPI.getFilePath(result.filePath);
                    setVideoUrl(fileUrl);
                    
                    // Create deliverables folder when loading project
                    try {
                      await ensureDeliverablesFolder(result.filePath);
                    } catch (error) {
                      console.error('Failed to create deliverables folder:', error);
                    }
                    
                    // Reload recent projects
                    if (window.electronAPI.getRecentProjects) {
                      const recent = await window.electronAPI.getRecentProjects();
                      setRecentProjects(recent);
                    }
                    
                    return;
                  }
                } catch (error) {
                  console.error('Failed to load project file:', error);
                  alert('Failed to load project file. Starting with empty annotations.');
                }
              }
            }
          }
          
          // No project file or user chose not to load it
          // Get file:// URL for the video
          const fileUrl = await window.electronAPI.getFilePath(result.filePath);
          setVideoUrl(fileUrl);
          setVideoFileName(result.name);
          setVideoPath(result.filePath);
          setAnnotations([]);
          
          // Create deliverables folder when video is loaded
          try {
            await ensureDeliverablesFolder(result.filePath);
          } catch (error) {
            console.error('Failed to create deliverables folder:', error);
            // Don't block video loading if folder creation fails
          }
        }
      } catch (error) {
        console.error('Error selecting video file:', error);
        alert(`Failed to select video file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      // Fallback to browser file input
      if (!event?.target.files?.[0]) return;
      const file = event.target.files[0];
      
      // Check if it's a video file
      if (!file.type.startsWith('video/')) {
        alert('Please select a valid video file.');
        return;
      }

      // Create object URL for the video file
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setVideoFileName(file.name);
      
      // Clear annotations when loading a new video
      setAnnotations([]);
    }
  };

  // Cleanup object URL when component unmounts or video changes
  useEffect(() => {
    return () => {
      // Only revoke blob URLs (browser mode), not file:// URLs (Electron mode)
      if (videoUrl && videoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  // Close file menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showFileMenu && !target.closest('[data-file-menu]')) {
        setShowFileMenu(false);
      }
    };

    if (showFileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showFileMenu]);

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header with video loader and annotation mode toggle */}
      <div
        style={{
          padding: '10px 20px',
          backgroundColor: '#333',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '15px',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '20px' }}>360° Video Annotator</h1>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, justifyContent: 'flex-end', position: 'relative' }}>
          {/* File Menu */}
          <div style={{ position: 'relative' }} data-file-menu>
            <button
              onClick={() => setShowFileMenu(!showFileMenu)}
              style={{
                padding: '10px 20px',
                backgroundColor: showFileMenu ? '#555' : '#444',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
              }}
            >
              📄 File
            </button>
            {showFileMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '5px',
                  backgroundColor: '#555',
                  borderRadius: '4px',
                  padding: '5px 0',
                  minWidth: '250px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                  zIndex: 1000,
                }}
                data-file-menu
              >
                {window.electronAPI && (
                  <>
                    <button
                      onClick={() => {
                        handleSaveProject();
                        setShowFileMenu(false);
                      }}
                      disabled={!videoUrl || annotations.length === 0}
                      style={{
                        width: '100%',
                        padding: '10px 20px',
                        backgroundColor: 'transparent',
                        color: (!videoUrl || annotations.length === 0) ? '#888' : 'white',
                        border: 'none',
                        textAlign: 'left',
                        cursor: (!videoUrl || annotations.length === 0) ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      💾 Save Project
                    </button>
                    <button
                      onClick={() => {
                        handleLoadProject();
                        setShowFileMenu(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 20px',
                        backgroundColor: 'transparent',
                        color: 'white',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      📂 Load Project
                    </button>
                    {recentProjects.length > 0 && (
                      <>
                        <div
                          style={{
                            height: '1px',
                            backgroundColor: '#777',
                            margin: '5px 0',
                          }}
                        />
                        <div
                          style={{
                            padding: '5px 20px',
                            color: '#aaa',
                            fontSize: '12px',
                            fontWeight: 'bold',
                          }}
                        >
                          Open Recent
                        </div>
                        {recentProjects.slice(0, 5).map((project) => (
                          <button
                            key={project.filePath}
                            onClick={() => {
                              handleLoadRecentProject(project.filePath);
                            }}
                            style={{
                              width: '100%',
                              padding: '8px 20px 8px 30px',
                              backgroundColor: 'transparent',
                              color: 'white',
                              border: 'none',
                              textAlign: 'left',
                              cursor: 'pointer',
                              fontSize: '13px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                            title={project.filePath}
                          >
                            {project.name}
                          </button>
                        ))}
                        <div
                          style={{
                            height: '1px',
                            backgroundColor: '#777',
                            margin: '5px 0',
                          }}
                        />
                      </>
                    )}
                  </>
                )}
                <button
                  onClick={() => {
                    handleExportScreenshots();
                    setShowFileMenu(false);
                  }}
                  disabled={annotations.length === 0}
                  style={{
                    width: '100%',
                    padding: '10px 20px',
                    backgroundColor: 'transparent',
                    color: annotations.length === 0 ? '#888' : 'white',
                    border: 'none',
                    textAlign: 'left',
                    cursor: annotations.length === 0 ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                  }}
                >
                  📷 Re-export Screenshots ({annotations.filter(a => a.screenshotDataUrl).length})
                </button>
                <button
                  onClick={() => {
                    handleExportCSV();
                    setShowFileMenu(false);
                  }}
                  disabled={annotations.length === 0}
                  style={{
                    width: '100%',
                    padding: '10px 20px',
                    backgroundColor: 'transparent',
                    color: annotations.length === 0 ? '#888' : 'white',
                    border: 'none',
                    textAlign: 'left',
                    cursor: annotations.length === 0 ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                  }}
                >
                  📊 Export CSV ({annotations.length} annotations)
                </button>
                <button
                  onClick={() => {
                    handleGeneratePDFReport();
                    setShowFileMenu(false);
                  }}
                  disabled={annotations.length === 0}
                  style={{
                    width: '100%',
                    padding: '10px 20px',
                    backgroundColor: 'transparent',
                    color: annotations.length === 0 ? '#888' : 'white',
                    border: 'none',
                    textAlign: 'left',
                    cursor: annotations.length === 0 ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                  }}
                >
                  📄 Generate PDF Report ({annotations.length} annotations)
                </button>
                <div
                  style={{
                    height: '1px',
                    backgroundColor: '#777',
                    margin: '5px 0',
                  }}
                />
                <button
                  onClick={() => {
                    setShowHighlightPlayer(true);
                    setShowFileMenu(false);
                  }}
                  disabled={annotations.length === 0 || !videoUrl}
                  style={{
                    width: '100%',
                    padding: '10px 20px',
                    backgroundColor: 'transparent',
                    color: (annotations.length === 0 || !videoUrl) ? '#888' : 'white',
                    border: 'none',
                    textAlign: 'left',
                    cursor: (annotations.length === 0 || !videoUrl) ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                  }}
                >
                  🎬 Highlight Video ({annotations.length} annotations)
                </button>
              </div>
            )}
          </div>
          {videoFileName && (
            <span style={{ fontSize: '14px', color: '#aaa', marginRight: '10px' }}>
              {videoFileName}
            </span>
          )}
          
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleVideoFileSelect}
            style={{ display: window.electronAPI ? 'none' : 'none' }}
          />
          
          <button
            onClick={() => {
              if (window.electronAPI) {
                handleVideoFileSelect();
              } else {
                fileInputRef.current?.click();
              }
            }}
            style={{
              padding: '10px 20px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            📁 Load Video
          </button>
          
          <button
            onClick={() => setAnnotationMode(!annotationMode)}
            disabled={!videoUrl}
            style={{
              padding: '10px 20px',
              backgroundColor: annotationMode ? '#4CAF50' : '#666',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: videoUrl ? 'pointer' : 'not-allowed',
              fontSize: '16px',
              fontWeight: 'bold',
              opacity: videoUrl ? 1 : 0.6,
            }}
          >
            {annotationMode ? '✓ Annotation Mode ON' : 'Annotation Mode OFF'}
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Video player area */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            position: 'relative',
            backgroundColor: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {videoUrl ? (
            <>
              <Video360Player
                videoUrl={videoUrl}
                onTimeUpdate={handleTimeUpdate}
                onVideoReady={handleVideoReady}
                disablePanning={annotationMode}
                seekToTime={seekToTime}
                shouldStayPaused={shouldStayPaused}
                onPlayClick={handlePlayClick}
              />
              {viewportSize.width > 0 && viewportSize.height > 0 && (
                <AnnotationOverlay
                  annotationMode={annotationMode}
                  currentVideoTime={currentVideoTime}
                  videoElement={videoElement}
                  annotations={annotations}
                  onAnnotationCreate={async (annotation) => await handleAnnotationCreate(annotation)}
                  width={viewportSize.width}
                  height={viewportSize.height}
                  disableInteractions={false}
                  onPauseVideo={handlePauseVideo}
                  onGetCameraRotation={handleGetCameraRotation}
                  onGetCamera={handleGetCamera}
                  selectedAnnotationId={selectedAnnotationId}
                />
              )}
            </>
          ) : (
            <div
              style={{
                textAlign: 'center',
                color: '#888',
                padding: '40px',
              }}
            >
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>📹</div>
              <h2 style={{ color: '#aaa', marginBottom: '10px' }}>No Video Loaded</h2>
              <p style={{ color: '#888', marginBottom: '20px' }}>
                Click "Load Video" to select a 360° equirectangular video file
              </p>
              <button
                onClick={() => {
                  if (window.electronAPI) {
                    handleVideoFileSelect();
                  } else {
                    fileInputRef.current?.click();
                  }
                }}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold',
                }}
              >
                📁 Load Video File
              </button>
            </div>
          )}
        </div>

        {/* Annotation list panel */}
        <div
          style={{
            width: '350px',
            borderLeft: '1px solid #ccc',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <AnnotationList
            annotations={annotations}
            onAnnotationClick={handleAnnotationClick}
            onAnnotationDelete={handleAnnotationDelete}
          />
        </div>
      </div>

      {/* Highlight Video Player Modal */}
      {showHighlightPlayer && videoElement && (
        <HighlightVideoPlayer
          videoElement={videoElement}
          annotations={annotations}
          onClose={() => setShowHighlightPlayer(false)}
          seekFunction={seekFunction}
          restoreCameraViewFunction={restoreCameraViewFunction}
          videoPath={videoPath}
          videoFileName={videoFileName}
        />
      )}
    </div>
  );
}

export default App;

