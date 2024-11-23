const fs = require('fs');
const os = require('os');

// Detectar si es macOS
if (os.platform() === 'darwin') {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

  // Agregar la resolución solo si no está configurada
  if (!packageJson.resolutions) {
    packageJson.resolutions = {};
  }

  packageJson.resolutions.fsevents = "2.3.2";

  fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
  console.log('Resolutions updated only for macOS');
} else {
  console.log('Resolutions NOT updated, this is only for macOS.');
}
