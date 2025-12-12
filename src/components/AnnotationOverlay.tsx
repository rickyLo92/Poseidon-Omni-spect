import { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { Annotation, ANNOTATION_COLORS, PRIMARY_DESCRIPTIONS, SECONDARY_DESCRIPTIONS } from '../types';
import { screenToWorldDirection, worldDirectionToScreen, getAnnotationBox } from '../utils/annotationGeometry';

interface AnnotationOverlayProps {
  /** Whether annotation mode is enabled */
  annotationMode: boolean;
  /** Current video time in seconds */
  currentVideoTime: number;
  /** Video element for capturing screenshots */
  videoElement: HTMLVideoElement | null;
  /** All annotations to display */
  annotations: Annotation[];
  /** Callback when a new annotation is created */
  onAnnotationCreate: (annotation: Omit<Annotation, 'id' | 'createdAt'>) => Promise<void>;
  /** Width of the viewport */
  width: number;
  /** Height of the viewport */
  height: number;
  /** Whether to disable mouse interactions (e.g., when not in annotation mode) */
  disableInteractions?: boolean;
  /** Callback to pause video when creating annotation */
  onPauseVideo?: () => void;
  /** Callback to get current camera rotation */
  onGetCameraRotation?: () => { phi: number; theta: number } | null;
  /** Callback to get Three.js camera for raycasting */
  onGetCamera?: () => THREE.PerspectiveCamera | null;
  /** ID of the currently selected annotation (clicked by user) */
  selectedAnnotationId?: string | null;
}

/**
 * AnnotationOverlay component handles drawing bounding boxes and creating annotations.
 * 
 * Key features:
 * - Draws rectangular bounding boxes when annotation mode is enabled
 * - Captures screenshots using an offscreen canvas
 * - Normalizes coordinates (0-1) relative to viewport size
 * - Shows a form dialog when a box is completed
 * - Displays active annotations based on video timestamp
 */
export function AnnotationOverlay({
  annotationMode,
  currentVideoTime,
  videoElement,
  annotations,
  onAnnotationCreate,
  width,
  height,
  disableInteractions = false,
  onPauseVideo,
  onGetCameraRotation,
  onGetCamera,
  selectedAnnotationId: _selectedAnnotationId,
}: AnnotationOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const currentBoxRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<{
    notes: string;
    colour: string;
    grade: number | 'N/A';
    drops: number | 'N/A';
    primaryDescription: string;
    secondaryDescription: string;
    description: string;
  }>({ 
    notes: '', 
    colour: ANNOTATION_COLORS[0].value,
    grade: 'N/A',
    drops: 'N/A',
    primaryDescription: '',
    secondaryDescription: '',
    description: '', // Legacy field, not used in new form
  });
  const [pendingBox, setPendingBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [pendingWorldDirection, setPendingWorldDirection] = useState<{ phi: number; theta: number } | null>(null);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  // Track the pending annotation that should be drawn with its final color during screenshot capture
  const [pendingAnnotationForScreenshot, setPendingAnnotationForScreenshot] = useState<{
    worldDirection: { phi: number; theta: number };
    box?: { x: number; y: number; width: number; height: number }; // For legacy compatibility
    colour: string;
    notes: string;
  } | null>(null);

  // Helper function to calculate color based on Grade/DROPS
  const calculateColor = (grade: number | 'N/A', drops: number | 'N/A'): string => {
    // If both have values, return current color (user can select)
    if (grade !== 'N/A' && drops !== 'N/A') {
      return formData.colour;
    }
    
    // If Grade = N/A, check DROPS
    if (grade === 'N/A' && drops !== 'N/A') {
      if (drops === 1) return '#00ff00'; // Green
      if (drops === 2) return '#ffff00'; // Yellow
      if (drops === 3) return '#ffa500'; // Orange
      if (drops === 4) return '#ff0000'; // Red
    }
    
    // If DROPS = N/A, check Grade
    if (drops === 'N/A' && grade !== 'N/A') {
      if (grade === 1) return '#00ff00'; // Green
      if (grade === 2) return '#ffff00'; // Yellow
      if (grade === 3) return '#ffa500'; // Orange
      if (grade === 4) return '#ff0000'; // Red
    }
    
    // Default to white if both are N/A
    return '#ffffff';
  };

  // Helper function to calculate Risk Index
  const calculateRiskIndex = (grade: number | 'N/A', drops: number | 'N/A'): number => {
    const gradeValue = grade === 'N/A' ? 3 : grade;
    const dropsValue = drops === 'N/A' ? 3 : drops;
    return gradeValue * dropsValue;
  };

  // Helper function to get Risk Level
  const getRiskLevel = (riskIndex: number): string => {
    if (riskIndex >= 1 && riskIndex <= 4) return 'Low';
    if (riskIndex >= 5 && riskIndex <= 8) return 'Medium';
    if (riskIndex >= 9 && riskIndex <= 12) return 'High';
    if (riskIndex >= 13 && riskIndex <= 16) return 'Extreme';
    return 'N/A';
  };

  // Get active annotations (within 1 second of current time)
  // Memoized to avoid recalculating on every render
  const activeAnnotations = useMemo(() => {
    return annotations.filter((ann) => {
      const timeMatches = Math.abs(ann.videoTime - currentVideoTime) < 1.0;
      return timeMatches;
    });
  }, [annotations, currentVideoTime]);

  // Drawing handlers - changed to right-click and drag
  // These handlers are called from the wrapper div
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only allow right-click (button 2) for annotation creation
    if (!annotationMode || disableInteractions || e.button !== 2) {
      // For left-click, let the event pass through to video player for panning
      return;
    }
    
    // Prevent context menu and stop propagation for right-click
    e.preventDefault();
    e.stopPropagation();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !canvasRef.current) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Pause video when starting annotation
    if (onPauseVideo && videoElement && !videoElement.paused) {
      onPauseVideo();
    }

    isDrawingRef.current = true;
    startPosRef.current = { x, y };
    currentBoxRef.current = null;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only handle mouse move if we're drawing (right-click drag)
    if (!annotationMode || !isDrawingRef.current || disableInteractions) {
      // For left-click drag (panning), let the event pass through
      return;
    }

    // Stop propagation for right-click drawing
    e.stopPropagation();

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !canvasRef.current) return;

    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const x = Math.min(startPosRef.current.x, currentX);
    const y = Math.min(startPosRef.current.y, currentY);
    const width = Math.abs(currentX - startPosRef.current.x);
    const height = Math.abs(currentY - startPosRef.current.y);

    currentBoxRef.current = { x, y, width, height };
    draw();
  };

  const handleMouseUp = async (e: React.MouseEvent<HTMLDivElement>) => {
    // Only handle right-click release
    if (!annotationMode || !isDrawingRef.current || disableInteractions || e.button !== 2) {
      // For left-click release, let the event pass through
      return;
    }
    
    // Stop propagation for right-click
    e.stopPropagation();
    
    isDrawingRef.current = false;

    if (!currentBoxRef.current || !canvasRef.current) return;

    // Ensure video is paused
    if (onPauseVideo && videoElement && !videoElement.paused) {
      onPauseVideo();
    }

    // Get camera and camera rotation for converting click to world direction
    const camera = onGetCamera ? onGetCamera() : null;
    const cameraRotation = onGetCameraRotation ? onGetCameraRotation() : null;

    if (!camera || !cameraRotation) {
      console.error('Cannot create annotation: camera or camera rotation not available');
      return;
    }

    // Calculate the center of the box in screen coordinates
    const boxCenterX = currentBoxRef.current.x + currentBoxRef.current.width / 2;
    const boxCenterY = currentBoxRef.current.y + currentBoxRef.current.height / 2;

    // Convert the box center to a world-space direction
    const worldDirection = screenToWorldDirection(
      boxCenterX,
      boxCenterY,
      width,
      height,
      camera,
      cameraRotation
    );

    if (!worldDirection) {
      console.error('Failed to convert screen coordinates to world direction');
      return;
    }

    // Store normalized box for screenshot/legacy compatibility, and world direction for new system
    const normalizedBox = {
      x: currentBoxRef.current.x / width,
      y: currentBoxRef.current.y / height,
      width: currentBoxRef.current.width / width,
      height: currentBoxRef.current.height / height,
    };

    // Store pending annotation data (both box and world direction)
    setPendingBox(normalizedBox);
    setPendingWorldDirection(worldDirection);
    setFormData({ 
      notes: '', 
      colour: ANNOTATION_COLORS[0].value,
      grade: 'N/A',
      drops: 'N/A',
      primaryDescription: '',
      secondaryDescription: '',
      description: '',
    });
    setShowForm(true);
  };

  // Use ref for the overlay div
  const overlayRef = useRef<HTMLDivElement>(null);

  // Helper to find the video player's renderer canvas element
  const findRendererCanvas = (): HTMLCanvasElement | null => {
    if (!overlayRef.current) return null;
    // The renderer canvas should be a sibling in the parent container
    const container = overlayRef.current.parentElement;
    if (container) {
      // Find all canvas elements
      const canvases = Array.from(container.querySelectorAll('canvas'));
      // The Three.js renderer canvas is typically the first canvas (before our annotation canvas)
      // Filter out our annotation canvas and return the first other canvas
      for (const canvas of canvases) {
        if (canvas !== canvasRef.current) {
          // Verify it's likely the Three.js canvas (has WebGL context or is a direct child)
          return canvas;
        }
      }
    }
    return null;
  };

  /**
   * Captures a screenshot by compositing the video renderer canvas with the overlay canvas.
   * This ensures both the video background and the colored annotation box are included.
   * Works in both Electron and browser modes.
   */
  const captureScreenshot = async (
    video: HTMLVideoElement,
    overlayCanvas: HTMLCanvasElement,
    _annotationBox: { x: number; y: number; width: number; height: number } | null,
    _annotationColor: string
  ): Promise<string> => {
    // Always use canvas compositing to ensure both video and overlay are included
    // This is more reliable than window capture
    return new Promise((resolve) => {
      // Wait for next frame to ensure everything is rendered
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const rendererCanvas = findRendererCanvas();
          
          if (!rendererCanvas) {
            console.error('Renderer canvas not found for screenshot');
            resolve('');
            return;
          }
          
          // Create a new canvas to composite both the video and overlay
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            console.error('Failed to get 2D context for screenshot canvas');
            resolve('');
            return;
          }
          
          // First draw the video (Three.js renderer canvas)
          try {
            ctx.drawImage(rendererCanvas, 0, 0, canvas.width, canvas.height);
          } catch (error) {
            console.error('Error drawing renderer canvas:', error);
            // Try video element as fallback
            if (video && video.readyState >= 2) {
              try {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              } catch (videoError) {
                console.error('Error drawing video element:', videoError);
              }
            }
          }
          
          // Then draw the overlay canvas (which contains the colored annotation box)
          // This MUST be drawn on top to show the annotation
          try {
            ctx.drawImage(overlayCanvas, 0, 0, canvas.width, canvas.height);
          } catch (error) {
            console.error('Error drawing overlay canvas:', error);
          }
          
          const dataUrl = canvas.toDataURL('image/png');
          
          resolve(dataUrl);
        });
      });
    });
  };

  /**
   * Draws all bounding boxes on the canvas.
   * Includes the current box being drawn and all active annotations.
   * Also draws the pending annotation with its final color during screenshot capture.
   * 
   * For world-space annotations, projects world directions to screen coordinates each frame.
   * For legacy annotations with box coordinates, uses those directly.
   */
  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get camera for projecting world-space annotations
    const camera = onGetCamera ? onGetCamera() : null;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw active annotations
    activeAnnotations.forEach((ann) => {
      let box: { x: number; y: number; width: number; height: number } | null = null;

      // Check if this is a new world-space annotation or legacy box annotation
      if (ann.worldDirection && camera) {
        // New world-space annotation: project to screen
        const screenPos = worldDirectionToScreen(ann.worldDirection, width, height, camera);
        if (screenPos) {
          // Use legacy box size if available, otherwise compute a default size
          if (ann.box) {
            // Use the original box dimensions
            box = {
              x: screenPos.x - (ann.box.width * width) / 2,
              y: screenPos.y - (ann.box.height * height) / 2,
              width: ann.box.width * width,
              height: ann.box.height * height,
            };
          } else {
            // Compute a default box size
            const defaultBox = getAnnotationBox(ann.worldDirection, width, height, camera, 5);
            box = defaultBox;
          }
        } else {
          // Annotation is behind camera or outside view, skip
          return;
        }
      } else if (ann.box) {
        // Legacy annotation: use box coordinates directly
        box = {
          x: ann.box.x * width,
          y: ann.box.y * height,
          width: ann.box.width * width,
          height: ann.box.height * height,
        };
      } else {
        // No valid coordinates, skip
        return;
      }

      if (box) {
        ctx.strokeStyle = ann.colour;
        ctx.lineWidth = 2;
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        // Draw notes if available (fallback to legacy label)
        const displayText = ann.notes || ann.label;
        if (displayText) {
          ctx.fillStyle = ann.colour;
          ctx.font = '14px Arial';
          ctx.fillText(displayText, box.x, box.y - 5);
        }
      }
    });

    // Draw pending annotation with its final color (for screenshot capture)
    if (pendingAnnotationForScreenshot && camera) {
      let box: { x: number; y: number; width: number; height: number } | null = null;

      // Project world direction to screen
      const screenPos = worldDirectionToScreen(
        pendingAnnotationForScreenshot.worldDirection,
        width,
        height,
        camera
      );

      if (screenPos) {
        if (pendingAnnotationForScreenshot.box) {
          // Use stored box dimensions
          box = {
            x: screenPos.x - (pendingAnnotationForScreenshot.box.width * width) / 2,
            y: screenPos.y - (pendingAnnotationForScreenshot.box.height * height) / 2,
            width: pendingAnnotationForScreenshot.box.width * width,
            height: pendingAnnotationForScreenshot.box.height * height,
          };
        } else {
          // Compute default box size
          box = getAnnotationBox(
            pendingAnnotationForScreenshot.worldDirection,
            width,
            height,
            camera,
            5
          );
        }

        if (box) {
          // Draw the annotation box border with selected color
          ctx.strokeStyle = pendingAnnotationForScreenshot.colour;
          ctx.lineWidth = 3;
          ctx.strokeRect(box.x, box.y, box.width, box.height);

          // Add semi-transparent overlay to highlight the area
          ctx.fillStyle = pendingAnnotationForScreenshot.colour;
          ctx.globalAlpha = 0.1;
          ctx.fillRect(box.x, box.y, box.width, box.height);
          ctx.globalAlpha = 1.0;

          // Draw the notes if provided
          if (pendingAnnotationForScreenshot.notes) {
            ctx.fillStyle = pendingAnnotationForScreenshot.colour;
            ctx.font = '14px Arial';
            ctx.fillText(pendingAnnotationForScreenshot.notes, box.x, box.y - 5);
          }
        }
      }
    }

    // Draw current box being drawn (only if not capturing screenshot)
    if (currentBoxRef.current && !isCapturingScreenshot) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        currentBoxRef.current.x,
        currentBoxRef.current.y,
        currentBoxRef.current.width,
        currentBoxRef.current.height
      );
      ctx.setLineDash([]);
    }
  };

  // Redraw when annotations, camera, or current box changes
  // World-space annotations need to be reprojected every frame when camera moves
  // We use requestAnimationFrame to continuously update annotations as the camera rotates
  // BUT: Don't redraw during screenshot capture to avoid clearing the canvas at the wrong time
  useEffect(() => {
    // Skip redraw if we're currently capturing a screenshot
    // The draw() will be called manually at the right time during capture
    if (isCapturingScreenshot) {
      return;
    }
    
    // Set up an animation frame loop to continuously redraw world-space annotations
    // This ensures annotations stay locked to their world positions as camera moves
    // This is necessary because camera rotation happens outside React's state system (in Three.js)
    let animationFrameId: number;
    const animate = () => {
      // Only continue animating if not capturing screenshot
      if (!isCapturingScreenshot) {
        draw();
        animationFrameId = requestAnimationFrame(animate);
      }
    };
    animate();
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
    // Note: We intentionally don't include draw in dependencies since it's stable
    // and we want this effect to run when annotations/width/height change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAnnotations.length, currentVideoTime, width, height, isCapturingScreenshot]);

  // Handle form submission
  const handleFormSubmit = async () => {
    if (!pendingBox || !pendingWorldDirection) return;

    // Validate: primary description is required
    if (!formData.primaryDescription) {
      alert('Please select a primary description.');
      return;
    }

    // Validate: secondary description is required
    if (!formData.secondaryDescription) {
      alert('Please select a secondary description.');
      return;
    }

    try {
      // Get current camera rotation if available
      const cameraRotation = onGetCameraRotation ? onGetCameraRotation() : undefined;

      // Calculate Risk Index and Risk Level
      const riskIndex = calculateRiskIndex(formData.grade, formData.drops);
      const riskLevel = getRiskLevel(riskIndex);

      // Get defect number (next sequential number)
      const defectNumber = annotations.length + 1;

      // Calculate color if needed (auto-calculate if one is N/A)
      let finalColor: string = formData.colour;
      if (formData.grade === 'N/A' || formData.drops === 'N/A') {
        finalColor = calculateColor(formData.grade, formData.drops);
      }

      // Create combined description for notes fallback
      const combinedDescription = `${formData.primaryDescription} - ${formData.secondaryDescription}`;
      
      // If notes is empty, use description as notes
      const finalNotes = formData.notes.trim() || combinedDescription || '';

      // Store the form data with world-space coordinates (primary) and box (for legacy/screenshot compatibility)
      const annotationData = {
        notes: finalNotes,
        colour: finalColor,
        grade: formData.grade,
        drops: formData.drops,
        riskIndex: riskIndex,
        riskLevel: riskLevel,
        primaryDescription: formData.primaryDescription,
        secondaryDescription: formData.secondaryDescription,
        description: `${formData.primaryDescription} - ${formData.secondaryDescription}`, // Combined for backward compatibility
        defectNumber: defectNumber,
        worldDirection: pendingWorldDirection, // Primary: world-space coordinates
        box: pendingBox, // Secondary: kept for screenshot/legacy compatibility
        cameraRotation: cameraRotation || undefined,
      };

      // STEP 1: Close the form first so it's not in the screenshot
      setShowForm(false);
      
      // STEP 2: Clear the current box being drawn so it doesn't interfere
      currentBoxRef.current = null;
      
      // STEP 3: Set the pending annotation FIRST (before blocking)
      // This ensures it's available when we draw
      // Use the already calculated finalColor from above
      const pendingAnnotation = {
        worldDirection: pendingWorldDirection,
        box: pendingBox, // Keep for screenshot capture
        colour: finalColor,
        notes: finalNotes,
      };
      setPendingAnnotationForScreenshot(pendingAnnotation);
      
      // STEP 4: Enable blocking overlay IMMEDIATELY to prevent ALL user interactions
      // This blocks panning, clicking, and any other interactions
      setIsCapturingScreenshot(true);
      
      // STEP 5: Wait for React state to update and form to disappear
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // STEP 6: Force a redraw to ensure the pending annotation is visible on the canvas
      // We do this manually while isCapturingScreenshot is true, so the useEffect won't interfere
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          // Clear canvas
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          
          // Get camera for projecting annotations
          const camera = onGetCamera ? onGetCamera() : null;

          // Draw active annotations first
          if (camera) {
            activeAnnotations.forEach((ann) => {
              let box: { x: number; y: number; width: number; height: number } | null = null;

              if (ann.worldDirection) {
                const screenPos = worldDirectionToScreen(ann.worldDirection, width, height, camera);
                if (screenPos && ann.box) {
                  box = {
                    x: screenPos.x - (ann.box.width * width) / 2,
                    y: screenPos.y - (ann.box.height * height) / 2,
                    width: ann.box.width * width,
                    height: ann.box.height * height,
                  };
                }
              } else if (ann.box) {
                box = {
                  x: ann.box.x * width,
                  y: ann.box.y * height,
                  width: ann.box.width * width,
                  height: ann.box.height * height,
                };
              }

              if (box) {
                ctx.strokeStyle = ann.colour;
                ctx.lineWidth = 2;
                ctx.strokeRect(box.x, box.y, box.width, box.height);

                const displayText = ann.notes || ann.label;
                if (displayText) {
                  ctx.fillStyle = ann.colour;
                  ctx.font = '14px Arial';
                  ctx.fillText(displayText, box.x, box.y - 5);
                }
              }
            });
          }
          
          // Draw the NEW pending annotation with its final color
          if (camera && pendingAnnotation.worldDirection && pendingAnnotation.box) {
            const screenPos = worldDirectionToScreen(pendingAnnotation.worldDirection, width, height, camera);
            if (screenPos) {
              const x = screenPos.x - (pendingAnnotation.box.width * width) / 2;
              const y = screenPos.y - (pendingAnnotation.box.height * height) / 2;
              const w = pendingAnnotation.box.width * width;
              const h = pendingAnnotation.box.height * height;

              // Draw the annotation box border with selected color
              ctx.strokeStyle = pendingAnnotation.colour;
              ctx.lineWidth = 3;
              ctx.strokeRect(x, y, w, h);

              // Add semi-transparent overlay to highlight the area
              ctx.fillStyle = pendingAnnotation.colour;
              ctx.globalAlpha = 0.1;
              ctx.fillRect(x, y, w, h);
              ctx.globalAlpha = 1.0;

              // Draw the notes if provided
              if (pendingAnnotation.notes) {
                ctx.fillStyle = pendingAnnotation.colour;
                ctx.font = '14px Arial';
                ctx.fillText(pendingAnnotation.notes, x, y - 5);
              }
            }
          }
        }
      }
      
      // STEP 7: Wait for the browser to paint the canvas changes
      // Use multiple requestAnimationFrame calls to ensure the canvas is fully rendered
      await new Promise(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve(undefined);
            });
          });
        });
      });
      
      // STEP 8: Additional delay to ensure everything is fully painted and visible
      await new Promise(resolve => setTimeout(resolve, 150));

      // STEP 9: Verify the annotation box is drawn on the canvas before capturing
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
        }
      }
      
      // STEP 10: Now capture screenshot - this will composite the renderer canvas (video) 
      // and overlay canvas (annotation box) together
      // IMPORTANT: isCapturingScreenshot is still true, so useEffect won't interfere
      let screenshotDataUrl = '';
      try {
        if (videoElement && canvasRef.current) {
          // Use the calculated color (auto or selected)
          const finalColorForScreenshot = (formData.grade === 'N/A' || formData.drops === 'N/A') 
            ? calculateColor(formData.grade, formData.drops)
            : formData.colour;
          screenshotDataUrl = await captureScreenshot(
            videoElement, 
            canvasRef.current, 
            null, // We don't need to pass the box since it's already on the overlay canvas
            finalColorForScreenshot
          );
          
          // Verify screenshot was captured successfully
          if (!screenshotDataUrl || screenshotDataUrl.length <= 100) {
            console.error('Screenshot capture failed or returned empty data');
            // Continue without screenshot - annotation will still be created
          }
        } else {
          console.error('Cannot capture screenshot: missing videoElement or canvas');
          // Continue without screenshot - annotation will still be created
        }
      } catch (screenshotError) {
        console.error('Error capturing screenshot:', screenshotError);
        // Continue without screenshot - annotation will still be created
      }

      // STEP 11: Clear the pending annotation (it will be added to activeAnnotations after creation)
      setPendingAnnotationForScreenshot(null);
      
      // STEP 12: Small delay before re-enabling interactions to ensure everything is complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // STEP 13: Disable blocking overlay - user can interact again
      setIsCapturingScreenshot(false);

      // Create annotation with the screenshot that includes the annotation box (but not the form)
      // Use the calculated color (auto or selected)
      const finalColorForAnnotation = (formData.grade === 'N/A' || formData.drops === 'N/A') 
        ? calculateColor(formData.grade, formData.drops)
        : formData.colour;
      
      await onAnnotationCreate({
        videoTime: currentVideoTime,
        screenshotDataUrl: screenshotDataUrl,
        ...annotationData,
        colour: finalColorForAnnotation,
      });

      setPendingBox(null);
      setPendingWorldDirection(null);
      currentBoxRef.current = null;
    } catch (error) {
      console.error('Error creating annotation:', error);
      alert(`Failed to create annotation: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Reset form state on error
      setShowForm(false);
      setPendingBox(null);
      setPendingWorldDirection(null);
      currentBoxRef.current = null;
      setIsCapturingScreenshot(false);
    }
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setPendingBox(null);
    setPendingWorldDirection(null);
    currentBoxRef.current = null;
  };

  return (
    <>
      {/* Blocking overlay to prevent ALL interactions during screenshot capture */}
      {isCapturingScreenshot && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            pointerEvents: 'auto',
            cursor: 'wait',
            backgroundColor: 'transparent', // Transparent so screenshot can capture what's underneath
            userSelect: 'none',
            touchAction: 'none',
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onMouseMove={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onMouseUp={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onWheel={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onTouchStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onTouchMove={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
      )}
      
      {/* Overlay div that handles right-click for annotations and forwards left-click to video player */}
      <div
        ref={overlayRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: width,
          height: height,
          // Block ALL interactions when capturing screenshot
          pointerEvents: (annotationMode && !disableInteractions && !isCapturingScreenshot) ? 'auto' : 'none',
          zIndex: 5,
        }}
        onMouseDown={(e) => {
          if (e.button === 2) {
            // Handle right-click for annotation drawing
            e.preventDefault();
            e.stopPropagation();
            handleMouseDown(e);
          } else if (e.button === 0) {
            // For left-click, forward to video player immediately
            const rendererElement = findRendererCanvas();
            if (rendererElement) {
              const nativeEvent = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                clientX: e.clientX,
                clientY: e.clientY,
                button: 0,
                buttons: 1,
                view: window,
              });
              rendererElement.dispatchEvent(nativeEvent);
            }
          }
        }}
        onMouseMove={(e) => {
          if (isDrawingRef.current) {
            // Handle right-click drag for annotation drawing
            e.stopPropagation();
            handleMouseMove(e);
          } else if (e.buttons === 1) {
            // Forward left-click drag to video player
            const rendererElement = findRendererCanvas();
            if (rendererElement) {
              const nativeEvent = new MouseEvent('mousemove', {
                bubbles: true,
                cancelable: true,
                clientX: e.clientX,
                clientY: e.clientY,
                button: 0,
                buttons: 1,
                view: window,
              });
              rendererElement.dispatchEvent(nativeEvent);
            }
          }
        }}
        onMouseUp={(e) => {
          if (e.button === 2) {
            // Handle right-click release for annotation drawing
            e.preventDefault();
            e.stopPropagation();
            handleMouseUp(e);
          } else if (e.button === 0) {
            // Forward left-click release to video player
            const rendererElement = findRendererCanvas();
            if (rendererElement) {
              const nativeEvent = new MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true,
                clientX: e.clientX,
                clientY: e.clientY,
                button: 0,
                buttons: 0,
                view: window,
              });
              rendererElement.dispatchEvent(nativeEvent);
            }
          }
        }}
        onContextMenu={(e) => {
          // Prevent context menu when in annotation mode
          if (annotationMode && !disableInteractions) {
            e.preventDefault();
          }
        }}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'none', // Canvas doesn't capture events
            zIndex: 5,
          }}
        />
      </div>
      {showForm && (() => {
        // Calculate auto-color and risk index for display
        const autoColor = (formData.grade === 'N/A' || formData.drops === 'N/A') 
          ? calculateColor(formData.grade, formData.drops)
          : formData.colour;
        const riskIndex = calculateRiskIndex(formData.grade, formData.drops);
        const riskLevel = getRiskLevel(riskIndex);
        const canSelectColor = formData.grade !== 'N/A' && formData.drops !== 'N/A';
        
        return (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: '#333',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
              zIndex: 100,
              minWidth: '350px',
              color: 'white',
            }}
          >
            <h3 style={{ marginTop: 0, color: 'white' }}>Create Annotation</h3>
            
            {/* 1. Primary Description */}
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'white' }}>Primary Description:</label>
              <select
                value={formData.primaryDescription}
                onChange={(e) => {
                  const newValue = e.target.value;
                  setFormData({ 
                    ...formData, 
                    primaryDescription: newValue,
                    secondaryDescription: '', // Reset secondary when primary changes
                  });
                }}
                style={{ width: '100%', padding: '8px', boxSizing: 'border-box', backgroundColor: '#555', color: 'white', border: '1px solid #666' }}
              >
                <option value="">Select primary description...</option>
                {PRIMARY_DESCRIPTIONS.map((desc) => (
                  <option key={desc} value={desc}>
                    {desc}
                  </option>
                ))}
              </select>
            </div>
            
            {/* 2. Secondary Description */}
            {formData.primaryDescription && (
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: 'white' }}>Secondary Description:</label>
                <select
                  value={formData.secondaryDescription}
                  onChange={(e) => {
                    setFormData({ ...formData, secondaryDescription: e.target.value });
                  }}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box', backgroundColor: '#555', color: 'white', border: '1px solid #666' }}
                >
                  <option value="">Select secondary description...</option>
                  {SECONDARY_DESCRIPTIONS[formData.primaryDescription]?.map((desc) => (
                    <option key={desc} value={desc}>
                      {desc}
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            {/* 3. Grade */}
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'white' }}>Grade:</label>
              <select
                value={formData.grade}
                onChange={(e) => {
                  const newValue: number | 'N/A' = e.target.value === 'N/A' ? 'N/A' : parseInt(e.target.value);
                  const updatedFormData = { 
                    ...formData, 
                    grade: newValue,
                    colour: (newValue === 'N/A' || formData.drops === 'N/A') 
                      ? calculateColor(newValue, formData.drops) 
                      : formData.colour
                  };
                  setFormData(updatedFormData);
                }}
                style={{ width: '100%', padding: '8px', boxSizing: 'border-box', backgroundColor: '#555', color: 'white', border: '1px solid #666' }}
              >
                <option value="N/A">N/A</option>
                {[1, 2, 3, 4].map((num) => (
                  <option key={num} value={num}>
                    {num}
                  </option>
                ))}
              </select>
            </div>
            
            {/* 4. DROPS */}
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'white' }}>DROPS:</label>
              <select
                value={formData.drops}
                onChange={(e) => {
                  const newValue: number | 'N/A' = e.target.value === 'N/A' ? 'N/A' : parseInt(e.target.value);
                  const updatedFormData = { 
                    ...formData, 
                    drops: newValue,
                    colour: (newValue === 'N/A' || formData.grade === 'N/A') 
                      ? calculateColor(formData.grade, newValue) 
                      : formData.colour
                  };
                  setFormData(updatedFormData);
                }}
                style={{ width: '100%', padding: '8px', boxSizing: 'border-box', backgroundColor: '#555', color: 'white', border: '1px solid #666' }}
              >
                <option value="N/A">N/A</option>
                {[1, 2, 3, 4].map((num) => (
                  <option key={num} value={num}>
                    {num}
                  </option>
                ))}
              </select>
            </div>
            
            {/* 5. Colour */}
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'white' }}>
                Colour {!canSelectColor && '(Auto-calculated)'}:
              </label>
              {canSelectColor ? (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {ANNOTATION_COLORS.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => setFormData({ ...formData, colour: color.value })}
                      style={{
                        width: '40px',
                        height: '40px',
                        backgroundColor: color.value,
                        border: formData.colour === color.value 
                          ? '3px solid #fff' 
                          : (color.value as string) === '#ffffff'
                            ? '2px solid #ccc' 
                            : '1px solid #ccc',
                        cursor: 'pointer',
                        borderRadius: '4px',
                      }}
                      title={color.name}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ 
                  padding: '10px', 
                  backgroundColor: autoColor, 
                  borderRadius: '4px',
                  textAlign: 'center',
                  color: autoColor === '#ffffff' ? '#000' : '#fff',
                  fontWeight: 'bold'
                }}>
                  {ANNOTATION_COLORS.find(c => c.value === autoColor)?.name || 'Auto'}
                </div>
              )}
            </div>
            
            {/* Risk Index and Risk Level Display */}
            <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#444', borderRadius: '4px' }}>
              <div style={{ color: 'white', fontSize: '14px' }}>
                <strong>Risk Index:</strong> {riskIndex} ({riskLevel})
              </div>
            </div>
            
            {/* 6. Notes */}
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'white' }}>Notes:</label>
              <input
                type="text"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                style={{ width: '100%', padding: '8px', boxSizing: 'border-box', backgroundColor: '#555', color: 'white', border: '1px solid #666' }}
                autoFocus
              />
            </div>
            
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button 
                onClick={handleFormCancel} 
                style={{ padding: '8px 16px', backgroundColor: '#666', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleFormSubmit}
                style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Save
              </button>
            </div>
          </div>
        );
      })()}
    </>
  );
}

