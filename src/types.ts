/**
 * Annotation interface defining the structure of a video annotation.
 * 
 * Coordinate System:
 * - World-space coordinates (worldDirection) are stored as spherical angles (phi, theta)
 *   representing a direction on the 360° sphere where the annotation is located.
 * - Legacy screen-space coordinates (box) are maintained for backwards compatibility.
 * - New annotations should use worldDirection; box is computed dynamically during rendering.
 */
export interface Annotation {
  /** Unique identifier for the annotation */
  id: string;
  /** Video timestamp in seconds when the annotation was created */
  videoTime: number;
  /** Base64 data URL of the screenshot captured at annotation time */
  screenshotDataUrl: string;
  /** User-provided notes for the annotation */
  notes: string;
  /** Color of the bounding box (e.g., "red", "green", "blue", "yellow") */
  colour: string;
  /** Grade score: N/A, 1, 2, 3, or 4 */
  grade?: number | 'N/A';
  /** DROPS score: N/A, 1, 2, 3, or 4 */
  drops?: number | 'N/A';
  /** Risk Index: Grade × DROPS (N/A treated as 3) */
  riskIndex?: number;
  /** Risk Level: Low, Medium, High, or Extreme based on Risk Index */
  riskLevel?: string;
  /** Primary description category */
  primaryDescription?: string;
  /** Secondary description (sub-category) */
  secondaryDescription?: string;
  /** Legacy description field (for backward compatibility) */
  description?: string;
  /** Defect Number (sequential number for each annotation) */
  defectNumber?: number;
  
  /** 
   * World-space direction on the 360° sphere (primary coordinate system).
   * - phi: vertical angle (pitch) in radians, range [-π/2, π/2], 0 = horizon, positive = up
   * - theta: horizontal angle (yaw) in radians, range [0, 2π], 0 = forward, positive = right
   * This represents the direction from the camera center (0,0,0) to the annotation point on the sphere.
   */
  worldDirection?: {
    phi: number;   // Vertical angle (pitch)
    theta: number; // Horizontal angle (yaw)
  };
  
  /** 
   * @deprecated Legacy screen-space bounding box coordinates (0-1 normalized).
   * This field is maintained for backwards compatibility with old annotations.
   * New annotations use worldDirection instead. For legacy annotations, this is used
   * to compute worldDirection during migration.
   */
  box?: {
    x: number;      // Left position (0-1)
    y: number;      // Top position (0-1)
    width: number;  // Width (0-1)
    height: number; // Height (0-1)
  };
  
  /** ISO timestamp when the annotation was created */
  createdAt: string;
  /** Camera rotation state when annotation was created (for restoring view) */
  cameraRotation?: {
    phi: number;
    theta: number;
  };
  
  // Legacy fields for backward compatibility
  /** @deprecated Use notes instead */
  label?: string;
  /** @deprecated Use grade instead */
  severity?: number;
  /** @deprecated Use drops instead */
  criticality?: number;
}

/**
 * Predefined color options for annotation bounding boxes
 */
export const ANNOTATION_COLORS = [
  { name: 'White', value: '#ffffff' },
  { name: 'Green', value: '#00ff00' },
  { name: 'Yellow', value: '#ffff00' },
  { name: 'Orange', value: '#ffa500' },
  { name: 'Red', value: '#ff0000' },
  { name: 'Blue', value: '#0000ff' },
  { name: 'Purple', value: '#800080' },
] as const;

/**
 * Primary description categories for annotations
 */
export const PRIMARY_DESCRIPTIONS = [
  'Structural & Access',
  'Piping & Valves',
  'Mechanical Equipment',
  'Electrical & Instrumentation',
  'Safety & Fire Protection',
  'Lifting Equipment',
] as const;

/**
 * Secondary description options based on primary category
 */
export const SECONDARY_DESCRIPTIONS: Record<string, readonly string[]> = {
  'Structural & Access': [
    'Corrosion/ Rust',
    'Coating failure',
    'Deformation/ Deflection',
    'Mechanical Damage',
    'Connection Issue',
    'Damaged Secondary',
    'Cracked or missing fireproofing (PFP)',
  ],
  'Piping & Valves': [
    'Corrosion',
    'Leaks/ Stains',
    'Damaged insulation/cladding',
    'Deformation/ Deflection',
    'Connection Issues',
    'Visible steam or vapour escape',
  ],
  'Mechanical Equipment': [
    'Leaks',
    'Loose or missing foundation bolts',
    'Damaged or missing guards/covers',
    'Excessive vibration (visible movement)',
    'Corrosion/ Rust',
  ],
  'Electrical & Instrumentation': [
    'Rust or damaged enclosures/fixtures',
    'Cracked or exposed cable insulation',
    'Loose or missing panel covers',
    'Faded or missing labels/warnings',
  ],
  'Safety & Fire Protection': [
    'Falling Object',
    'Blocked or corroded fire nozzles/sprays',
    'Damaged fire extinguishers/cabinets',
    'Obstructions',
    'Broken or missing non-slip surfaces',
    'Faded or missing safety signage',
  ],
  'Lifting Equipment': [
    'Rust/ Corrosion',
    'Connection Issues',
    'Mechanical Damage',
  ],
} as const;

/**
 * Legacy description options (for backward compatibility)
 */
export const ANNOTATION_DESCRIPTIONS = [
  'Rust',
  'Corrosion',
  'Surface deterioration',
  'Flaking/Blistering',
  'Coating failure',
  'Exposed metal',
  'Steel cracks',
  'Deformation',
  'Biofouling',
  'Connection issues',
  'Stains',
  'Leaks',
  'Safety hazard',
  'Other',
] as const;

/**
 * LocalStorage key for persisting annotations
 */
export const STORAGE_KEY = 'annotations-360-player';

/**
 * Project file format for saving/loading complete project state
 */
export interface ProjectFile {
  version: string;
  videoFileName: string;
  videoPath?: string;
  annotations: Annotation[];
  createdAt: string;
  lastModified: string;
  projectInfo?: {
    projectName: string;
    location: string;
    section: string;
    dateOfCapture: string;
  };
}

