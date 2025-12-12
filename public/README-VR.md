# 360° Video Annotator - VR/WebXR Usage Guide

## Overview

The 360° Video Annotator now supports **WebXR/VR viewing** on compatible devices (e.g., Oculus Quest via Oculus Browser). This feature allows you to view your 360° video annotations in immersive virtual reality while maintaining all existing desktop functionality.

## Important Notes

- **Desktop/Electron mode remains unchanged**: All existing functionality (annotation creation, CSV export, project saving) works exactly as before on desktop and Electron builds.
- **VR mode is read-only for annotations**: While viewing in VR, annotation creation is disabled to avoid UX confusion. Annotations are visible but cannot be created or edited while in VR.
- **Feature detection**: The VR entry button only appears on WebXR-capable devices (e.g., Oculus Browser). It will not appear in regular desktop browsers or Electron.

## Requirements for VR Viewing

1. **WebXR-capable device**: 
   - Oculus Quest (1, 2, or 3) with Oculus Browser
   - Other WebXR-compatible headsets and browsers
   
2. **Built application**: The app must be built and served via HTTPS (required for WebXR):
   ```bash
   npm run build
   ```
   
3. **HTTPS hosting**: WebXR requires a secure context (HTTPS). Options:
   - Use a local HTTPS server (e.g., `npx serve -s dist --ssl`)
   - Deploy to a hosting service with HTTPS
   - Use ngrok or similar for local HTTPS tunneling

## Using VR Mode

### Step 1: Build the Application

First, build the application for production:

```bash
npm run build
```

This creates an optimized build in the `dist/` directory.

### Step 2: Serve the Application via HTTPS

You must serve the built application over HTTPS. Here are some options:

#### Option A: Using serve with SSL
```bash
npx serve -s dist --ssl-cert path/to/cert.pem --ssl-key path/to/key.pem
```

#### Option B: Using a simple HTTPS server (Node.js)
```bash
# Install http-server if needed
npm install -g http-server

# Run with HTTPS (you'll need SSL certificates)
http-server dist -S -C cert.pem -K key.pem -p 8080
```

#### Option C: Deploy to a hosting service
Upload the contents of `dist/` to any static hosting service with HTTPS (Netlify, Vercel, GitHub Pages with custom domain, etc.).

### Step 3: Open in Oculus Browser

1. Put on your Oculus Quest headset
2. Open the **Oculus Browser**
3. Navigate to the HTTPS URL where you're hosting the application
4. Wait for the 360° video player to load

### Step 4: Enter VR Mode

1. **Load a video**: Use the file menu to load a 360° video as usual
2. **Locate the VR button**: You should see an "Enter VR" button in the bottom-right corner of the viewer
3. **Enter VR**: Tap the "Enter VR" button to enter immersive VR mode
4. **View in VR**: Use head movement to look around the 360° environment naturally

### Step 5: Exit VR Mode

- **Option 1**: Use the VR controller to access the browser's back button/menu
- **Option 2**: Look for the VR exit UI (typically provided by the browser or headset)
- **Option 3**: The app will automatically return to desktop view when you exit VR through the headset

## VR Features

### Head Tracking
- Natural head movement controls your view direction in the 360° video
- Smooth tracking with low latency
- Full 360° rotation in all directions

### Video Playback
- Video continues playing in VR mode
- Video controls (play/pause, seek) work normally
- Video texture updates smoothly in VR

### Annotations in VR
- **Viewing**: Existing annotations are visible in VR (as 2D overlays)
- **Creation**: Annotation creation is disabled while in VR mode to prevent confusion
- **Interactions**: Use desktop mode to create and edit annotations, then view them in VR

## Desktop vs VR Comparison

| Feature | Desktop/Electron | VR Mode |
|---------|------------------|---------|
| Video playback | ✅ Full support | ✅ Full support |
| Video controls | ✅ Play, pause, seek | ✅ Play, pause, seek |
| Mouse/touch panning | ✅ Available | ❌ Disabled (head tracking used) |
| Annotation creation | ✅ Full support | ❌ Disabled (read-only) |
| Annotation viewing | ✅ Full support | ✅ View only |
| CSV export | ✅ Available | ✅ Available (after exiting VR) |
| Project saving | ✅ Available | ✅ Available (after exiting VR) |

## Troubleshooting

### VR Button Not Appearing

**Possible causes:**
1. **Not on a WebXR-capable device**: The VR button only appears on devices that support WebXR (Oculus Browser, etc.)
2. **Not using HTTPS**: WebXR requires HTTPS. Ensure your server is using `https://` not `http://`
3. **Browser doesn't support WebXR**: Some browsers don't support WebXR even on VR devices. Try Oculus Browser specifically.

**Solution**: Verify you're using Oculus Browser on an Oculus Quest device, and the app is served over HTTPS.

### Cannot Enter VR Mode

**Possible causes:**
1. **WebXR permissions**: The browser may need permission to access VR features
2. **Headset not connected**: Ensure your Oculus Quest is powered on and connected

**Solution**: Grant VR permissions when prompted by the browser, and ensure the headset is properly set up.

### Poor Performance in VR

**Possible causes:**
1. **Large video files**: Very high resolution videos may struggle in VR
2. **Network issues**: Streaming videos over slow networks can cause stuttering

**Solution**: 
- Use lower resolution videos for VR viewing
- Ensure good network connectivity
- Pre-load videos before entering VR mode

### Annotations Not Visible in VR

**Current behavior**: Annotations appear as 2D overlays in VR. They may not be perfectly positioned for 3D viewing. This is expected behavior in the current implementation.

**Future enhancement**: Full 3D world-locked annotations are planned for a future update.

## Technical Details

### WebXR Integration

- Uses Three.js WebXR support (`renderer.xr.enabled = true`)
- Leverages `renderer.setAnimationLoop()` for VR-compatible rendering
- Automatically handles stereo rendering when in VR mode
- Mouse controls are automatically disabled when `renderer.xr.isPresenting === true`

### Browser Compatibility

- ✅ **Oculus Browser** (Oculus Quest) - Fully supported
- ✅ **Chrome/Edge with WebXR flags** (for testing on desktop)
- ❌ **Regular desktop browsers** - VR button hidden (normal desktop mode)
- ❌ **Electron** - VR button hidden (normal desktop mode)

### Security

WebXR requires a secure context (HTTPS) for security reasons. This is a browser requirement and cannot be bypassed. Always serve the built application over HTTPS when using VR features.

## Desktop/Electron Usage (Unchanged)

All desktop and Electron functionality remains exactly as before:

- **Development mode**: `npm run dev` (browser) or `npm run electron:dev` (Electron)
- **Production build**: `npm run build` then `npm run electron:dist`
- **Annotation creation**: Full support with mouse/touch
- **File operations**: CSV export, project saving all work normally

The VR features are completely opt-in and do not affect desktop usage in any way.

## Support

For issues specific to VR viewing, ensure:
1. You're using Oculus Browser on an Oculus Quest
2. The app is served over HTTPS
3. The build is from the latest version

For general application issues, refer to the main README or project documentation.

