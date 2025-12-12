import { useEffect, useRef, useState } from 'react';
import { Annotation } from '../types';
import { ensureDeliverablesFolder } from '../utils/storage';

interface HighlightVideoPlayerProps {
  videoElement: HTMLVideoElement | null;
  annotations: Annotation[];
  onClose: () => void;
  seekFunction: ((time: number) => void) | null;
  restoreCameraViewFunction: ((phi: number, theta: number) => void) | null;
  videoPath?: string;
  videoFileName?: string;
}

/**
 * HighlightVideoPlayer component that creates a video from annotation screenshots.
 * Each screenshot is displayed for 2 seconds in the output video.
 */
export function HighlightVideoPlayer({
  videoElement: _videoElement,
  annotations,
  onClose,
  seekFunction: _seekFunction,
  restoreCameraViewFunction: _restoreCameraViewFunction,
  videoPath,
  videoFileName: _videoFileName,
}: HighlightVideoPlayerProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentAnnotationIndex, setCurrentAnnotationIndex] = useState(0);
  const [status, setStatus] = useState<string>('Ready');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Sort annotations by timestamp
  const sortedAnnotations = [...annotations].sort((a, b) => a.videoTime - b.videoTime);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Create video from annotation screenshots
  const createHighlightVideo = async (): Promise<Blob | null> => {
    if (sortedAnnotations.length === 0) {
      alert('No annotations with screenshots available.');
      return null;
    }

    // Filter annotations that have screenshots
    const annotationsWithScreenshots = sortedAnnotations.filter(ann => ann.screenshotDataUrl);
    
    if (annotationsWithScreenshots.length === 0) {
      alert('No annotations have screenshots. Please create annotations with screenshots first.');
      return null;
    }

    try {
      setStatus('Creating highlight video from screenshots...');
      setIsRecording(true);

      // Create a canvas for video recording
      const canvas = document.createElement('canvas');
      canvas.width = 1920; // HD width
      canvas.height = 1080; // HD height
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      // Create a stream from the canvas
      const stream = canvas.captureStream(30); // 30 FPS
      streamRef.current = stream;

      // Create MediaRecorder
      const options: MediaRecorderOptions = {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 5000000, // 5 Mbps
      };

      // Fallback to other codecs if vp9 not supported
      if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
        options.mimeType = 'video/webm;codecs=vp8';
        if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
          options.mimeType = 'video/webm';
        }
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      recordedChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      // Start recording
      mediaRecorder.start();

      // Draw each screenshot for 2 seconds (60 frames at 30fps = 2 seconds)
      const framesPerScreenshot = 60; // 2 seconds at 30fps
      
      for (let i = 0; i < annotationsWithScreenshots.length; i++) {
        const annotation = annotationsWithScreenshots[i];
        setCurrentAnnotationIndex(i);
        setStatus(`Processing screenshot ${i + 1}/${annotationsWithScreenshots.length}...`);
        
        // Calculate progress
        const progressPercent = ((i + 1) / annotationsWithScreenshots.length) * 100;
        setProgress(progressPercent);

        // Load the screenshot image
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = annotation.screenshotDataUrl;
        });

        // Calculate dimensions to fit canvas while maintaining aspect ratio
        const imgAspect = img.width / img.height;
        const canvasAspect = canvas.width / canvas.height;
        
        let drawWidth = canvas.width;
        let drawHeight = canvas.height;
        let drawX = 0;
        let drawY = 0;

        if (imgAspect > canvasAspect) {
          // Image is wider - fit to width
          drawHeight = canvas.width / imgAspect;
          drawY = (canvas.height - drawHeight) / 2;
        } else {
          // Image is taller - fit to height
          drawWidth = canvas.height * imgAspect;
          drawX = (canvas.width - drawWidth) / 2;
        }

        // Draw the screenshot for 2 seconds (60 frames)
        for (let frame = 0; frame < framesPerScreenshot; frame++) {
          // Clear canvas with black background
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Draw the screenshot
          ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
          
          // Wait for next frame
          await new Promise(resolve => setTimeout(resolve, 1000 / 30)); // 30 FPS
        }
      }

      // Stop recording
      mediaRecorder.stop();

      // Wait for recording to finish
      return new Promise((resolve) => {
        mediaRecorder.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          setRecordedBlob(blob);
          setIsRecording(false);
          setStatus('Highlight video created successfully!');
          
          // Stop canvas stream
          stream.getTracks().forEach(track => track.stop());
          
          resolve(blob);
        };
      });
    } catch (error) {
      console.error('Error creating highlight video:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsRecording(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      return null;
    }
  };


  // Save or download recorded video
  const downloadVideo = async () => {
    if (!recordedBlob) {
      alert('No recorded video available');
      return;
    }

    // Check if we're in Electron and have videoPath
    if (window.electronAPI && window.electronAPI.saveVideo && videoPath) {
      try {
        // Get deliverables folder path
        const deliverablesPath = await ensureDeliverablesFolder(videoPath);
        
        // Convert blob to buffer
        const arrayBuffer = await recordedBlob.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);
        
        // Generate filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `highlight-video-${timestamp}.webm`;
        
        // Save to deliverables folder
        await window.electronAPI.saveVideo(filename, buffer, deliverablesPath);
        alert(`Highlight video saved successfully to deliverables folder!`);
      } catch (error) {
        console.error('Failed to save video:', error);
        alert(`Failed to save video: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // Fallback to download
        downloadVideoFallback();
      }
    } else {
      // Browser fallback: download directly
      downloadVideoFallback();
    }
  };

  // Fallback download function for browser
  const downloadVideoFallback = () => {
    if (!recordedBlob) return;
    
    const url = URL.createObjectURL(recordedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `highlight-video-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Start creating highlight video
  const handlePlay = async () => {
    if (sortedAnnotations.length === 0) {
      alert('No annotations available. Please create some annotations first.');
      return;
    }

    // Filter annotations with screenshots
    const annotationsWithScreenshots = sortedAnnotations.filter(ann => ann.screenshotDataUrl);
    
    if (annotationsWithScreenshots.length === 0) {
      alert('No annotations have screenshots. Please create annotations with screenshots first.');
      return;
    }

    // Reset state
    setCurrentAnnotationIndex(0);
    setProgress(0);
    setRecordedBlob(null);

    // Create the highlight video
    const blob = await createHighlightVideo();
    
    if (blob) {
      setStatus('Highlight video created! Click "Save" to save it to deliverables folder.');
    }
  };


  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          backgroundColor: '#1a1a1a',
          borderRadius: '8px',
          padding: '30px',
          maxWidth: '600px',
          width: '100%',
          color: 'white',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>Highlight Video Player</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid #666',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            ✕ Close
          </button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <p style={{ margin: '5px 0', color: '#aaa' }}>
            Creates a highlight video from annotation screenshots. Each screenshot is displayed for <strong>2 seconds</strong>.
          </p>
          <p style={{ margin: '5px 0', color: '#aaa' }}>
            Annotations with screenshots: <strong>{sortedAnnotations.filter(a => a.screenshotDataUrl).length}</strong> / {sortedAnnotations.length}
          </p>
          <p style={{ margin: '5px 0', color: '#888' }}>
            Status: <strong>{status}</strong>
          </p>
        </div>

        {sortedAnnotations.length === 0 && (
          <div style={{ padding: '20px', backgroundColor: '#333', borderRadius: '4px', marginBottom: '20px' }}>
            <p style={{ margin: 0, color: '#ff6b6b' }}>
              No annotations found. Please create some annotations first.
            </p>
          </div>
        )}


        {/* Progress bar */}
        <div style={{ marginBottom: '20px' }}>
          <div
            style={{
              width: '100%',
              height: '8px',
              backgroundColor: '#333',
              borderRadius: '4px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                backgroundColor: '#4CAF50',
                transition: 'width 0.1s',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px', fontSize: '12px', color: '#888' }}>
            <span>{Math.floor(progress)}%</span>
            <span>
              {currentAnnotationIndex}/{sortedAnnotations.filter(a => a.screenshotDataUrl).length} screenshots
            </span>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button
            onClick={handlePlay}
            disabled={sortedAnnotations.filter(a => a.screenshotDataUrl).length === 0 || isRecording}
            style={{
              padding: '12px 24px',
              backgroundColor: sortedAnnotations.filter(a => a.screenshotDataUrl).length === 0 ? '#666' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: sortedAnnotations.filter(a => a.screenshotDataUrl).length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
              flex: 1,
            }}
          >
            {isRecording ? '⏳ Creating Video...' : '🎬 Create Highlight Video'}
          </button>
        </div>

        {/* Save/Download button */}
        {recordedBlob && (
          <button
            onClick={downloadVideo}
            style={{
              width: '100%',
              padding: '12px 24px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
              marginBottom: '10px',
            }}
          >
            {videoPath ? '💾 Save Highlight Video to Deliverables' : '📥 Download Highlight Video'}
          </button>
        )}

        {isRecording && (
          <div style={{ textAlign: 'center', marginTop: '10px' }}>
            <div
              style={{
                display: 'inline-block',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                backgroundColor: '#f44336',
                animation: 'pulse 1s infinite',
              }}
            />
            <span style={{ marginLeft: '10px', color: '#f44336' }}>Recording...</span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

