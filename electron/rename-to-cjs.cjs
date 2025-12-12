const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '../dist-electron');
const filesToRename = ['main.js', 'preload.js'];

filesToRename.forEach(file => {
  const oldPath = path.join(distDir, file);
  const newPath = path.join(distDir, file.replace('.js', '.cjs'));
  
  if (fs.existsSync(oldPath)) {
    fs.renameSync(oldPath, newPath);
    console.log(`Renamed ${file} to ${file.replace('.js', '.cjs')}`);
  }
});


