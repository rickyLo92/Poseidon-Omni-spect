# 360° Video Annotator

A React + TypeScript application for viewing and annotating 360-degree equirectangular videos with interactive bounding box annotations.

**🚀 Now available as a Desktop App!** Run as Electron app for **10-20x faster** video loading with large files. See [README-ELECTRON.md](README-ELECTRON.md) for details.

**📋 See [PROGRESS.md](PROGRESS.md) for complete feature list and development progress.**

## Features

- **360° Video Playback**: View equirectangular MP4 videos in an interactive 360-degree viewer using Three.js
- **Interactive Panning**: Click and drag to look around the 360° environment
- **Annotation Mode**: Toggle annotation mode to draw bounding boxes on the video
- **Annotation Management**: 
  - Create annotations with text labels and color selection
  - Automatic screenshot capture at annotation time
  - Timestamp-based annotation display (annotations appear when video time is within 0.5 seconds)
  - Persistent storage using localStorage
- **Annotation List**: Side panel showing all annotations with thumbnails, timestamps, and seek functionality

## Prerequisites

**Node.js must be installed first!**

If you see an error when running `run.bat`:
1. Download and install Node.js from **https://nodejs.org/** (choose the LTS version)
2. **RESTART YOUR COMPUTER** after installation
3. Double-click `run.bat` again

See `INSTALL_NODEJS.md` for detailed installation instructions.

## Quick Start

### Option 1: Desktop App (Recommended for Large Videos)

**Double-click `run-electron.bat`** - This runs the app as a desktop application with:
- ✅ **10-20x faster** video loading (no upload needed!)
- ✅ Direct file system access
- ✅ Better performance for large files

### Option 2: Web Browser

**Double-click `run.bat`** - This runs the app in your web browser.

The scripts will:
- Find Node.js automatically (even if not in PATH)
- Install dependencies if needed
- Start the development server
- Open the app (desktop window or browser)

**Load your video**: Click the "Load Video" button and select your 360° equirectangular video file (MP4, WebM, etc.)

## Usage

1. **Loading a Video**: Click the "Load Video" button and select your 360° equirectangular video file
2. **Viewing**: Once loaded, use the Play/Pause button to control playback
3. **Panning**: Click and drag on the video to look around the 360° environment (when annotation mode is OFF)
4. **Creating Annotations**:
   - Click the "Annotation Mode" toggle button to enable annotation mode
   - Click and drag on the video to draw a bounding box
   - Release the mouse to open the annotation form
   - Enter annotation text and select a color
   - Click "Save" to create the annotation
4. **Viewing Annotations**: Annotations automatically appear when the video time is within 0.5 seconds of their timestamp
5. **Seeking**: Click any annotation in the side panel to jump to that timestamp
6. **Deleting**: Click the "Delete" button on any annotation in the list

## Technical Details

### Annotation Storage

Annotations are stored in localStorage with the key `annotations-360-player`. Each annotation includes:
- Unique ID
- Video timestamp (seconds)
- Normalized bounding box coordinates (0-1)
- Color
- Label text
- Screenshot (base64 data URL)
- Creation timestamp

### Coordinate System

All bounding box coordinates are normalized (0-1) relative to the viewport size. This ensures annotations scale correctly when the window is resized.

### Screenshot Capture

Screenshots are captured using an offscreen canvas. The current video frame is drawn to the canvas, then converted to a base64 PNG data URL.

### Time Tracking

The video element's `timeupdate` event is used to track the current playback time. Annotations are considered "active" when `Math.abs(annotation.videoTime - currentTime) < 0.5`.

## Project Structure

```
360-video-annotator/
  src/
    components/
      Video360Player.tsx    # Three.js 360° video renderer
      AnnotationOverlay.tsx  # Bounding box drawing and form
      AnnotationList.tsx     # Side panel with annotation list
    utils/
      storage.ts            # localStorage persistence utilities
    types.ts               # TypeScript interfaces
    App.tsx                # Main application component
    main.tsx               # Entry point
    index.css              # Global styles
  public/                  # Place your video file here
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  run.bat                  # Double-click to run
```

## Dependencies

- React 18
- TypeScript
- Three.js (for 360° rendering)
- Vite (build tool)

