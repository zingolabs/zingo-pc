const fs = require('fs');
const { execSync } = require('child_process');
const os = require('os');

// Detectar si es macOS
if (os.platform() === 'darwin') {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

  // Agregar la resolución solo si no está configurada
  if (!packageJson.resolutions) {
    packageJson.resolutions = {};
    packageJson.resolutions.fsevents = "2.3.2";

    fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
    console.log('Resolutions updated only for macOS, re-running yarn again.');
    execSync('yarn install', { stdio: 'inherit' });
    delete packageJson.resolutions.fsevents;
    delete packageJson.resolutions;
    fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
  }
} else {
  console.log('Resolutions NOT updated, this is only for macOS.');
}
