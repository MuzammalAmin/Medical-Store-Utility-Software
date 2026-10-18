// Removes Electron's WebGPU shader compiler (~26 MB). The app never uses WebGPU,
// and dropping it keeps the installer under GitHub's 100 MB file limit.
const fs = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(context) {
  for (const file of ['dxcompiler.dll', 'dxil.dll']) {
    fs.rmSync(path.join(context.appOutDir, file), { force: true });
  }
};
