import * as THREE from 'three';

/**
 * Utility module for converting between screen coordinates and world-space directions
 * for 360° video annotations.
 * 
 * Coordinate System:
 * - The 360 sphere is centered at (0, 0, 0)
 * - Camera is at (0, 0, 0) looking outward
 * - phi: vertical angle (pitch), range [-π/2, π/2] where 0 is horizon, positive is up
 * - theta: horizontal angle (yaw), range [0, 2π], where 0 is forward, positive is right
 * 
 * World-space direction is stored as spherical coordinates (phi, theta) that represent
 * a point on the unit sphere where the annotation should appear.
 */

/**
 * Converts a screen click position to a world-space direction on the 360 sphere.
 * 
 * @param screenX - X position in screen pixels (0 = left)
 * @param screenY - Y position in screen pixels (0 = top)
 * @param screenWidth - Width of the viewport in pixels
 * @param screenHeight - Height of the viewport in pixels
 * @param camera - Three.js PerspectiveCamera used for rendering
 * @param cameraRotation - Current camera rotation { phi, theta } in spherical coordinates
 * @returns World-space direction { phi, theta } on the unit sphere, or null if invalid
 */
export function screenToWorldDirection(
  screenX: number,
  screenY: number,
  screenWidth: number,
  screenHeight: number,
  camera: THREE.PerspectiveCamera,
  _cameraRotation: { phi: number; theta: number }
): { phi: number; theta: number } | null {
  // Convert screen coordinates to normalized device coordinates (NDC)
  // NDC: x in [-1, 1] (left to right), y in [-1, 1] (top to bottom)
  const ndcX = (screenX / screenWidth) * 2 - 1;
  const ndcY = -(screenY / screenHeight) * 2 + 1; // Flip Y axis (screen Y increases downward)

  // Create a ray from the camera through the NDC point
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2(ndcX, ndcY);
  
  // Set the raycaster to use the camera's current orientation
  raycaster.setFromCamera(mouse, camera);

  // Get the ray direction in world space
  // This direction is already in world space, pointing from camera (0,0,0) through the clicked point
  const rayDirection = raycaster.ray.direction;
  
  // Normalize to ensure it's a unit vector
  rayDirection.normalize();

  // Convert the direction vector to spherical coordinates (phi, theta)
  // Using the same coordinate system as the camera rotation
  const theta = Math.atan2(rayDirection.x, rayDirection.z);
  const phi = Math.asin(rayDirection.y);

  return { phi, theta };
}

/**
 * Converts a world-space direction to screen coordinates.
 * 
 * @param worldDirection - World-space direction { phi, theta } on the unit sphere
 * @param screenWidth - Width of the viewport in pixels
 * @param screenHeight - Height of the viewport in pixels
 * @param camera - Three.js PerspectiveCamera used for rendering
 * @returns Screen coordinates { x, y } in pixels, or null if behind camera/outside view
 */
export function worldDirectionToScreen(
  worldDirection: { phi: number; theta: number },
  screenWidth: number,
  screenHeight: number,
  camera: THREE.PerspectiveCamera
): { x: number; y: number } | null {
  // Convert spherical coordinates to 3D direction vector
  const direction = new THREE.Vector3();
  
  // Convert (phi, theta) to unit direction vector
  // phi is vertical angle (pitch), theta is horizontal angle (yaw)
  direction.x = Math.cos(worldDirection.phi) * Math.sin(worldDirection.theta);
  direction.y = Math.sin(worldDirection.phi);
  direction.z = Math.cos(worldDirection.phi) * Math.cos(worldDirection.theta);
  
  // Normalize to ensure unit vector
  direction.normalize();

  // Project the 3D direction to screen space using the camera
  const vector = direction.clone();
  vector.project(camera);

  // Convert from NDC to screen coordinates
  const x = (vector.x + 1) * screenWidth / 2;
  const y = (-vector.y + 1) * screenHeight / 2; // Flip Y axis back

  // Check if the point is behind the camera or outside a reasonable view
  // If z > 1 in clip space, it's behind the camera
  // We also check if it's way outside the viewport (more than 2x the viewport size)
  const clipX = vector.x;
  const clipY = vector.y;
  const clipZ = vector.z;
  
  // Points behind camera have clipZ > 1
  if (clipZ > 1) {
    return null;
  }
  
  // Points far outside viewport (more than 2 viewport widths/heights away)
  if (Math.abs(clipX) > 3 || Math.abs(clipY) > 3) {
    return null;
  }

  return { x, y };
}

/**
 * Converts a legacy box annotation (screen-space) to world-space direction.
 * This is used for migrating old annotations.
 * 
 * @param box - Legacy box { x, y, width, height } in normalized coordinates (0-1)
 * @param cameraRotation - Camera rotation when annotation was created { phi, theta }
 * @returns World-space direction { phi, theta } approximating the center of the box
 */
export function legacyBoxToWorldDirection(
  box: { x: number; y: number; width: number; height: number },
  cameraRotation?: { phi: number; theta: number }
): { phi: number; theta: number } {
  // If we have camera rotation, we can attempt a more accurate conversion
  // For now, we'll use a simplified approximation assuming the box center
  // was at the center of the viewport when created (cameraRotation = 0,0)
  
  // Box center in normalized coordinates (0-1)
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  
  // Convert to NDC-like coordinates (assuming viewport was centered)
  // This is an approximation - without knowing the exact camera state, we can't be perfect
  const ndcX = (centerX - 0.5) * 2; // -1 to 1
  const ndcY = -(centerY - 0.5) * 2; // -1 to 1 (flip Y)
  
  // Approximate the direction using the field of view
  // For a typical 75° FOV camera, we can estimate
  const fov = 75 * (Math.PI / 180); // Convert to radians
  // const aspect = 1; // Assume square for migration (or use typical aspect) - unused for now
  
  // Estimate phi and theta from NDC coordinates
  // This is approximate and assumes the annotation was created at default camera orientation
  // const theta = Math.atan2(ndcX, 1) * (fov / 2); // Unused - calculated differently below
  // const phi = Math.atan2(ndcY, 1) * (fov / 2); // Unused - calculated differently below
  
  // If we have camera rotation, adjust the world direction
  if (cameraRotation) {
    // The box was created with a specific camera orientation
    // The NDC coordinates represent a direction relative to that camera orientation
    // We need to convert from camera-relative to world-absolute
    
    // First, create a direction vector relative to the camera orientation
    const cameraRelativeTheta = Math.atan2(ndcX, 1) * (fov / 2);
    const cameraRelativePhi = Math.atan2(ndcY, 1) * (fov / 2);
    
    // Convert camera-relative to world direction
    // This requires rotation math - simplified for now
    const worldTheta = cameraRotation.theta + cameraRelativeTheta;
    let worldPhi = cameraRotation.phi + cameraRelativePhi;
    
    // Clamp phi to valid range
    worldPhi = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, worldPhi));
    
    return { phi: worldPhi, theta: worldTheta };
  }
  
  // Default: assume annotation was at center of viewport
  return { phi: 0, theta: 0 };
}

/**
 * Gets the center point of a bounding box for annotation display.
 * For world-space annotations, this is a helper to compute box dimensions.
 * 
 * @param worldDirection - World-space direction { phi, theta }
 * @param screenWidth - Width of the viewport in pixels
 * @param screenHeight - Height of the viewport in pixels
 * @param camera - Three.js PerspectiveCamera
 * @param boxSizeDegrees - Size of the annotation box in degrees (default: 5°)
 * @returns Bounding box in screen coordinates, or null if not visible
 */
export function getAnnotationBox(
  worldDirection: { phi: number; theta: number },
  screenWidth: number,
  screenHeight: number,
  camera: THREE.PerspectiveCamera,
  boxSizeDegrees: number = 5
): { x: number; y: number; width: number; height: number } | null {
  const center = worldDirectionToScreen(worldDirection, screenWidth, screenHeight, camera);
  if (!center) {
    return null;
  }

  // Calculate box size in pixels based on angular size
  // Approximate: for small angles, pixel size ≈ angular_size * distance_to_sphere * pixels_per_radian
  // The sphere radius is 500 units, and the camera FOV determines pixels per radian
  const fovRadians = camera.fov * (Math.PI / 180);
  const pixelsPerRadian = screenHeight / (2 * Math.tan(fovRadians / 2));
  const boxSizeRadians = boxSizeDegrees * (Math.PI / 180);
  const boxSizePixels = boxSizeRadians * pixelsPerRadian;

  // Create a box centered on the annotation point
  const boxWidth = Math.max(20, boxSizePixels); // Minimum 20px
  const boxHeight = Math.max(20, boxSizePixels);

  return {
    x: center.x - boxWidth / 2,
    y: center.y - boxHeight / 2,
    width: boxWidth,
    height: boxHeight,
  };
}

