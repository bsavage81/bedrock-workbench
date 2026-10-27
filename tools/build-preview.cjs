// Reproducible, dependency-free browser asset: shared conversion + UI renderer.
const fs=require('node:fs');
fs.writeFileSync('media/model-preview.js',fs.readFileSync('src/preview-geometry.cjs','utf8')+'\n'+fs.readFileSync('media/preview-renderer.js','utf8'));
