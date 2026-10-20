const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const defaultManifestPath = path.join(root, '.local/fundtogether/generated/vnext-deployment.local.json');

function loadManifest(manifestPath = process.env.FUNDTOGETHER_VNEXT_MANIFEST_PATH || defaultManifestPath) {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

async function verifyVNextRuntime(manifestPath) {
  const { parseVNextDeploymentManifest, verifyVNextDeployment, vnextClient } = require('../../dist/src/blockchain/vnext-deployment.js');
  const manifest = parseVNextDeploymentManifest(loadManifest(manifestPath));
  await verifyVNextDeployment(vnextClient(manifest), manifest);
  return manifest;
}

if (require.main === module) {
  verifyVNextRuntime(process.argv[2])
    .then(manifest => {
      console.log(JSON.stringify({
        protocolKind: manifest.protocolKind,
        chainId: manifest.chainId,
        deploymentBlockNumber: manifest.deploymentBlockNumber,
        campaignEscrow: manifest.campaignEscrow,
        juryRegistry: manifest.juryRegistry,
        juryReview: manifest.juryReview,
      }, null, 2));
    })
    .catch(error => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}

module.exports = { defaultManifestPath, loadManifest, verifyVNextRuntime };
