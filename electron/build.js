import { build } from 'vite';
import { spawn } from 'child_process';
import { build as electronBuild } from 'electron-builder';

// Build the renderer (Vite)
await build();

// Build the main process (TypeScript)
const tsc = spawn('tsc', ['-p', 'electron/tsconfig.json'], {
  stdio: 'inherit',
  shell: true,
});

await new Promise((resolve, reject) => {
  tsc.on('close', (code) => {
    if (code === 0) {
      resolve();
    } else {
      reject(new Error(`TypeScript compilation failed with code ${code}`));
    }
  });
});

// Build Electron app
await electronBuild();


