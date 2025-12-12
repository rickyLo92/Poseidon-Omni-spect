import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';

interface Video360PlayerProps {
  videoUrl: string | null;
  onTimeUpdate: (time: number) => void;
  onVideoReady: (
    videoElement: HTMLVideoElement,
    seek: (time: number) => void,
    restoreCameraView: (phi: number, theta: number) => void,
    getCameraRotation: () => { phi: number; theta: number } | null,
    getCamera: () => THREE.PerspectiveCamera | null
  ) => void;
  /** When true, disables right-click panning (for annotation mode), but left-click panning still works */
  disablePanning?: boolean;
  /** Seek to specific time and optionally restore camera view */
  seekToTime?: { time: number; cameraRotation?: { phi: number; theta: number } } | null;
  /** When true, prevents video from auto-playing after seeking */
  shouldStayPaused?: boolean;
  /** Callback when play button is clicked */
  onPlayClick?: () => void;
}

/**
 * Video360Player component that renders a 360° equirectangular video
 * using Three.js. The video is displayed as a texture on the inside of a sphere.
 * 
 * The component handles:
 * - Three.js scene initialization
 * - Video element creation and texture mapping
 * - Camera controls for panning around the 360 view
 * - Time tracking and seeking
 */
export function Video360Player({ videoUrl, onTimeUpdate, onVideoReady, disablePanning = false, seekToTime, shouldStayPaused = false, onPlayClick }: Video360PlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const textureRef = useRef<THREE.VideoTexture | null>(null);
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const loadCompleteDismissedRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadComplete, setLoadComplete] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Camera rotation state (spherical coordinates)
  const cameraRotationRef = useRef({ phi: 0, theta: 0 });

  useEffect(() => {
    if (!containerRef.current || !videoUrl) {
      setIsLoading(false);
      setLoadComplete(false);
      setLoadingProgress(0);
      return;
    }


    // Reset loading state when new video URL is set
    setIsLoading(true);
    setLoadComplete(false);
    setLoadingProgress(0);
    loadCompleteDismissedRef.current = false; // Reset dismissal state for new video

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Validate container dimensions
    if (width === 0 || height === 0) {
      console.warn('Container has zero dimensions');
      return;
    }

    // Store callbacks in refs to avoid dependency issues
    const timeUpdateCallback = onTimeUpdate;
    const videoReadyCallback = onVideoReady;
    
    // Store shouldStayPaused in a ref to access it in event handlers
    const shouldStayPausedRef = { current: shouldStayPaused };

    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let renderer: THREE.WebGLRenderer;
    let geometry: THREE.SphereGeometry;
    let material: THREE.MeshBasicMaterial;
    let mesh: THREE.Mesh;

    try {
      // Create scene
      scene = new THREE.Scene();
      sceneRef.current = scene;

      // Create camera
      camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      camera.position.set(0, 0, 0);
      cameraRef.current = camera;

      // Create renderer
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
      
      // Enable WebXR support (feature-detected, opt-in)
      // Only enable if WebXR is available (Oculus Browser, etc.)
      if ('xr' in navigator) {
        renderer.xr.enabled = true;
        
        // Create VR button and append to container if WebXR is available
        try {
          const vrButton = VRButton.createButton(renderer);
          vrButton.style.position = 'absolute';
          vrButton.style.bottom = '20px';
          vrButton.style.right = '20px';
          vrButton.style.zIndex = '1000';
          container.appendChild(vrButton);
        } catch (error) {
          // VRButton might not be available in all environments - this is expected
          // in non-WebXR browsers or Electron, so we silently fail
          console.debug('VRButton not available (expected in non-WebXR environments)');
        }
      }
      
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;
    } catch (error) {
      console.error('Failed to initialize Three.js:', error);
      return;
    }

    // Create video element
    const video = document.createElement('video');
    
    try {
      video.src = videoUrl;
      // Only set crossOrigin for remote URLs, not blob URLs or file:// URLs
      if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
        video.crossOrigin = 'anonymous';
      }
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      videoRef.current = video;
    } catch (error) {
      console.error('Error setting up video element:', error);
      setIsLoading(false);
      setLoadComplete(false);
      alert(`Failed to set up video: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return;
    }

    // Handle video errors
    const handleVideoError = (e: Event) => {
      console.error('Video error:', e);
      const error = video.error;
      if (error) {
        console.error('Video error code:', error.code, 'Message:', error.message);
        setIsLoading(false);
        setLoadComplete(false);
        alert(`Failed to load video: ${error.message || 'Unknown error'}`);
      }
    };

    // Handle video loading progress
    const handleProgress = () => {
      if (video.buffered.length > 0 && video.duration > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const progress = (bufferedEnd / video.duration) * 100;
        setLoadingProgress(Math.min(100, progress));
      }
    };

    // Handle video loading started
    const handleLoadStart = () => {
      setIsLoading(true);
      setLoadComplete(false);
      setLoadingProgress(0);
    };

    video.addEventListener('error', handleVideoError);
    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('progress', handleProgress);

    // Create video texture
    const texture = new THREE.VideoTexture(video);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    textureRef.current = texture;

    // Load the video
    try {
      video.load();
    } catch (error) {
      console.error('Error calling video.load():', error);
      setIsLoading(false);
      setLoadComplete(false);
      alert(`Failed to load video file. Please check the file path and try again.`);
    }

    try {
      // Create sphere geometry (inside-out)
      geometry = new THREE.SphereGeometry(500, 60, 40);
      geometry.scale(-1, 1, 1);
      
      material = new THREE.MeshBasicMaterial({ map: texture });
      mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
    } catch (error) {
      console.error('Failed to create sphere geometry:', error);
      setIsLoading(false);
      setLoadComplete(false);
      if (rendererRef.current && container.contains(rendererRef.current.domElement)) {
        container.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
      alert(`Failed to create 3D scene: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return;
    }

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      cameraRef.current.aspect = newWidth / newHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    // Mouse drag controls for panning
    // In annotation mode: left-click = pan, right-click = annotation drawing (handled by overlay)
    // Only active when not in VR session
    const handleMouseDown = (e: MouseEvent) => {
      // Only allow panning when not in VR
      if (renderer.xr.isPresenting) return;
      
      // Only allow left-click (button 0) for panning
      // Right-click is reserved for annotation drawing when in annotation mode
      if (e.button !== 0) return; // Only left mouse button for panning
      isDraggingRef.current = true;
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      // Only allow panning when not in VR
      if (renderer.xr.isPresenting) {
        isDraggingRef.current = false;
        return;
      }
      
      if (!isDraggingRef.current || !cameraRef.current) return;
      
      const deltaX = e.clientX - previousMousePositionRef.current.x;
      const deltaY = e.clientY - previousMousePositionRef.current.y;

      // Update spherical coordinates
      cameraRotationRef.current.theta -= deltaX * 0.005;
      cameraRotationRef.current.phi += deltaY * 0.005;
      
      // Clamp phi to prevent flipping
      cameraRotationRef.current.phi = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, cameraRotationRef.current.phi));

      // Convert to cartesian coordinates
      const x = Math.cos(cameraRotationRef.current.phi) * Math.sin(cameraRotationRef.current.theta);
      const y = Math.sin(cameraRotationRef.current.phi);
      const z = Math.cos(cameraRotationRef.current.phi) * Math.cos(cameraRotationRef.current.theta);

      cameraRef.current.lookAt(x, y, z);
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    // Always add event listeners - panning is controlled by button check in handleMouseDown
    // Mouse controls are disabled automatically when in VR via isPresenting check
    renderer.domElement.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Video time tracking
    const handleTimeUpdate = () => {
      if (video) {
        setCurrentTime(video.currentTime);
        setDuration(video.duration || 0);
        timeUpdateCallback(video.currentTime);
      }
    };
    video.addEventListener('timeupdate', handleTimeUpdate);
    
    // Handle duration change
    const handleDurationChange = () => {
      if (video) {
        setDuration(video.duration || 0);
      }
    };
    video.addEventListener('durationchange', handleDurationChange);

    // Seek function
    const seek = (time: number) => {
      if (video) {
        video.currentTime = time;
      }
    };

    // Restore camera view function
    const restoreCameraView = (phi: number, theta: number) => {
      cameraRotationRef.current.phi = phi;
      cameraRotationRef.current.theta = theta;
      
      // Clamp phi to prevent flipping
      cameraRotationRef.current.phi = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, cameraRotationRef.current.phi));
      
      // Convert to cartesian coordinates
      const x = Math.cos(cameraRotationRef.current.phi) * Math.sin(cameraRotationRef.current.theta);
      const y = Math.sin(cameraRotationRef.current.phi);
      const z = Math.cos(cameraRotationRef.current.phi) * Math.cos(cameraRotationRef.current.theta);
      
      if (cameraRef.current) {
        cameraRef.current.lookAt(x, y, z);
      }
    };

    // Get camera rotation function
    const getCameraRotation = (): { phi: number; theta: number } | null => {
      return cameraRotationRef.current ? { ...cameraRotationRef.current } : null;
    };

    // Get camera function for raycasting
    const getCamera = (): THREE.PerspectiveCamera | null => {
      return cameraRef.current;
    };

    // Expose video element and functions to parent
    // Use setTimeout to ensure video is set up before calling callback
    setTimeout(() => {
      videoReadyCallback(video, seek, restoreCameraView, getCameraRotation, getCamera);
    }, 0);

    // Video event handlers
    const handleVideoLoadedMetadata = () => {
      // Update texture when metadata is loaded
      if (textureRef.current) {
        textureRef.current.needsUpdate = true;
      }
      // Update progress based on metadata
      if (video.duration > 0) {
        const progress = (video.buffered.length > 0 ? video.buffered.end(0) / video.duration : 0) * 100;
        setLoadingProgress(Math.min(100, progress));
      }
    };

    const handleVideoCanPlay = async () => {
      // Update texture
      if (textureRef.current) {
        textureRef.current.needsUpdate = true;
      }
      // Mark as loaded
      setIsLoading(false);
      // Only show load complete message if it hasn't been dismissed yet
      if (!loadCompleteDismissedRef.current) {
        setLoadComplete(true);
      }
      setLoadingProgress(100);
      setDuration(video.duration || 0);
      
      // Try to play automatically only if not paused by annotation click
      // Use ref to get current value since closure might have stale value
      if (!shouldStayPausedRef.current) {
        try {
          await video.play();
        } catch (err) {
          // Autoplay prevented, user will need to click play
        }
      } else {
        // Ensure video is paused if shouldStayPaused is true
        video.pause();
      }
    };

    const handleVideoPlaying = () => {
      setIsPlaying(true);
    };

    const handleVideoPause = () => {
      setIsPlaying(false);
    };

    video.addEventListener('loadedmetadata', handleVideoLoadedMetadata);
    video.addEventListener('canplay', handleVideoCanPlay);
    video.addEventListener('playing', handleVideoPlaying);
    video.addEventListener('pause', handleVideoPause);
    
    // Update ref when shouldStayPaused changes
    shouldStayPausedRef.current = shouldStayPaused;

    // Animation loop using setAnimationLoop for VR compatibility
    // This works for both normal desktop rendering and WebXR VR rendering
    renderer.setAnimationLoop((time, frame) => {
      try {
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          // Update texture if video is ready (needed for both desktop and VR)
          if (textureRef.current && video.readyState >= 2) {
            textureRef.current.needsUpdate = true;
          }
          
          // Render the scene
          // When in VR, Three.js automatically handles stereo rendering
          // When not in VR, this behaves like normal render()
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      } catch (error) {
        console.error('Error in animation loop:', error);
        // Stop animation on error
        renderer.setAnimationLoop(null);
      }
    });

    // Cleanup
    return () => {
      // Stop animation loop
      if (rendererRef.current) {
        rendererRef.current.setAnimationLoop(null);
      }
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('error', handleVideoError);
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('loadedmetadata', handleVideoLoadedMetadata);
      video.removeEventListener('canplay', handleVideoCanPlay);
      video.removeEventListener('playing', handleVideoPlaying);
      video.removeEventListener('pause', handleVideoPause);
      
      // Reset loading state
      setIsLoading(false);
      setLoadComplete(false);
      setLoadingProgress(0);
      
      // Pause and cleanup video
      video.pause();
      video.src = '';
      video.load();
      
      if (textureRef.current) {
        textureRef.current.dispose();
        textureRef.current = null;
      }
      
      // Clean up VR button if it exists
      const vrButtons = container.querySelectorAll('[class*="VRButton"], button[class*="vr"]');
      vrButtons.forEach(btn => {
        if (container.contains(btn)) {
          container.removeChild(btn);
        }
      });
      
      if (rendererRef.current && container.contains(rendererRef.current.domElement)) {
        container.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
      if (geometry) {
        geometry.dispose();
      }
      if (material) {
        material.dispose();
      }
      if (mesh && scene) {
        scene.remove(mesh);
      }
      sceneRef.current = null;
      cameraRef.current = null;
    };
    // Only depend on videoUrl and disablePanning to prevent infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl, disablePanning, shouldStayPaused]);

  // Handle seekToTime prop - seek to time, restore camera view, and pause video
  useEffect(() => {
    if (!seekToTime || !videoRef.current) return;
    
    // Seek to the specified time
    videoRef.current.currentTime = seekToTime.time;
    
    // Always pause the video when seeking from annotation click
    videoRef.current.pause();
    
    // Restore camera view if provided
    if (seekToTime.cameraRotation && cameraRotationRef.current) {
      cameraRotationRef.current.phi = seekToTime.cameraRotation.phi;
      cameraRotationRef.current.theta = seekToTime.cameraRotation.theta;
      
      // Clamp phi to prevent flipping
      cameraRotationRef.current.phi = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, cameraRotationRef.current.phi));
      
      // Convert to cartesian coordinates and update camera
      if (cameraRef.current) {
        const x = Math.cos(cameraRotationRef.current.phi) * Math.sin(cameraRotationRef.current.theta);
        const y = Math.sin(cameraRotationRef.current.phi);
        const z = Math.cos(cameraRotationRef.current.phi) * Math.cos(cameraRotationRef.current.theta);
        cameraRef.current.lookAt(x, y, z);
      }
    }
  }, [seekToTime]);

  // Prevent auto-play when shouldStayPaused is true
  useEffect(() => {
    if (shouldStayPaused && videoRef.current) {
      // Force pause if shouldStayPaused is true
      if (!videoRef.current.paused) {
        videoRef.current.pause();
      }
      // Also prevent any automatic play attempts
      const video = videoRef.current;
      const handlePlayAttempt = (e: Event) => {
        if (shouldStayPaused) {
          e.preventDefault();
          video.pause();
        }
      };
      video.addEventListener('play', handlePlayAttempt);
      return () => {
        video.removeEventListener('play', handlePlayAttempt);
      };
    }
  }, [shouldStayPaused]);

  const togglePlayPause = async () => {
    if (!videoRef.current) return;
    try {
      if (videoRef.current.paused) {
        // Call onPlayClick callback if provided (to clear shouldStayPaused flag)
        if (onPlayClick) {
          onPlayClick();
        }
        await videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    } catch (error) {
      console.error('Error toggling play/pause:', error);
    }
  };

  // Add keyboard support for spacebar to play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle spacebar if user is not typing in an input field
      if (e.code === 'Space' || e.key === ' ') {
        const target = e.target as HTMLElement;
        // Don't trigger if user is typing in an input, textarea, or contenteditable element
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        ) {
          return;
        }
        
        // Prevent default behavior (page scroll)
        e.preventDefault();
        
        // Toggle play/pause
        if (videoRef.current) {
          try {
            if (videoRef.current.paused) {
              videoRef.current.play();
            } else {
              videoRef.current.pause();
            }
          } catch (error) {
            console.error('Error toggling play/pause:', error);
          }
        }
      }
    };

    // Only add listener if video is loaded
    if (videoUrl) {
      window.addEventListener('keydown', handleKeyDown);
    }
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl]); // Re-setup when video changes

  const seekVideo = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(seconds, duration || 0));
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const skipBackward = () => {
    if (!videoRef.current) return;
    seekVideo(currentTime - 10);
  };

  const skipForward = () => {
    if (!videoRef.current) return;
    seekVideo(currentTime + 10);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      
      {/* Loading overlay */}
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            color: 'white',
            padding: '40px',
          }}
        >
          <div style={{ fontSize: '24px', marginBottom: '20px' }}>⏳</div>
          <h2 style={{ margin: '0 0 20px 0', fontSize: '24px' }}>Loading Video...</h2>
          
          {/* Progress bar */}
          <div
            style={{
              width: '100%',
              maxWidth: '500px',
              height: '30px',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              borderRadius: '15px',
              overflow: 'hidden',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                width: `${loadingProgress}%`,
                height: '100%',
                backgroundColor: '#2196F3',
                transition: 'width 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '14px',
              }}
            >
              {loadingProgress >= 10 && `${Math.round(loadingProgress)}%`}
            </div>
          </div>
          
          <p style={{ margin: '10px 0', fontSize: '16px', textAlign: 'center', maxWidth: '600px' }}>
            {loadingProgress < 50
              ? 'Reading video file and preparing for playback...'
              : loadingProgress < 90
              ? 'Buffering video data...'
              : 'Finalizing video setup...'}
          </p>
          
          {/* Explanation text */}
          <div
            style={{
              marginTop: '30px',
              padding: '20px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              maxWidth: '600px',
              fontSize: '14px',
              lineHeight: '1.6',
            }}
          >
            <strong>Why is loading taking so long?</strong>
            <ul style={{ margin: '10px 0', paddingLeft: '20px', textAlign: 'left' }}>
              <li><strong>Large file size:</strong> 360° videos are typically much larger than regular videos (often 100MB-1GB+)</li>
              <li><strong>High resolution:</strong> Equirectangular videos need high resolution to look good in 360°</li>
              <li><strong>Browser processing:</strong> The browser needs to decode and prepare the video for Three.js rendering</li>
              <li><strong>Memory allocation:</strong> Large videos require significant memory to buffer</li>
              <li><strong>Network speed:</strong> If loading from a server, your internet speed affects loading time</li>
              <li><strong>Desktop app advantage:</strong> Direct file access means no upload needed - much faster!</li>
            </ul>
            <p style={{ margin: '10px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
              {(window as any).electronAPI 
                ? '✓ Running as desktop app - direct file access enabled for faster loading!'
                : 'Tip: For faster loading, use compressed video formats (H.264) and lower resolutions for testing.'}
            </p>
          </div>
        </div>
      )}
      
      {/* Loading complete message - stays until user clicks OK */}
      {loadComplete && !isLoading && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(76, 175, 80, 0.95)',
            color: 'white',
            padding: '30px 50px',
            borderRadius: '8px',
            zIndex: 100,
            fontSize: '18px',
            fontWeight: 'bold',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '15px',
            minWidth: '300px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>✓</span>
            <span>Loading Complete - Video Ready to View!</span>
          </div>
          <button
            onClick={() => {
              setLoadComplete(false);
              loadCompleteDismissedRef.current = true; // Mark as dismissed so it won't show again
            }}
            style={{
              padding: '10px 30px',
              backgroundColor: 'white',
              color: '#4CAF50',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
              marginTop: '10px',
            }}
          >
            OK
          </button>
        </div>
      )}
      
      {/* Video controls */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          right: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '15px',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: '15px 20px',
          borderRadius: '8px',
          zIndex: 10,
        }}
      >
        <button
          onClick={togglePlayPause}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            cursor: 'pointer',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            minWidth: '80px',
          }}
        >
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>
        
        <button
          onClick={skipBackward}
          style={{
            padding: '10px 15px',
            fontSize: '16px',
            cursor: 'pointer',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
          }}
          title="Skip back 10 seconds"
        >
          ⏪ -10s
        </button>
        
        <button
          onClick={skipForward}
          style={{
            padding: '10px 15px',
            fontSize: '16px',
            cursor: 'pointer',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
          }}
          title="Skip forward 10 seconds"
        >
          +10s ⏩
        </button>
        
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: 'white',
            fontSize: '16px',
            marginLeft: '10px',
          }}
        >
          <span>{formatTime(currentTime)}</span>
          <span>/</span>
          <span>{formatTime(duration)}</span>
        </div>
        
        {/* Seek slider */}
        <input
          type="range"
          min="0"
          max={duration || 0}
          value={currentTime}
          onChange={(e) => seekVideo(parseFloat(e.target.value))}
          style={{
            flex: 1,
            maxWidth: '400px',
            height: '6px',
            cursor: 'pointer',
          }}
        />
      </div>
    </div>
  );
}
