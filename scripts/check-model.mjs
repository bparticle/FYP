// Sanity-check a compressed GLB for the FYP triptych fold.
// Usage: node scripts/check-model.mjs public/models/fyp-triptych.glb
//
// The page folds the wings by rotating the LEFTCARD / RIGHTCARD nodes about
// their local Z, which only works if (a) those node names exist and (b) the
// geometry was NOT meshopt/quantized (that moves the node origins off the
// hinges). This script verifies both and prints the node origins so you can
// confirm LEFTCARD.x ~ left-hinge.x and RIGHTCARD.x ~ right-hinge.x.

import { readFileSync } from 'fs';

const file = process.argv[2] || 'public/models/fyp-triptych.glb';
const buf = readFileSync(file);
if (buf.readUInt32LE(0) !== 0x46546c67) { fail('Not a GLB file: ' + file); }
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));

const names = (json.nodes || []).map((n) => n.name);
const need = ['LEFTCARD', 'RIGHTCARD', 'CENTER'];
const missing = need.filter((n) => !names.includes(n));

const req = json.extensionsRequired || [];
const quantized = req.includes('KHR_mesh_quantization') || req.includes('EXT_meshopt_compression');

console.log('  nodes:', names.join(', '));
for (const n of json.nodes || []) {
  if (n.name === 'LEFTCARD' || n.name === 'RIGHTCARD') {
    const t = n.translation || [0, 0, 0];
    console.log(`  ${n.name} origin x=${t[0].toFixed(4)} ${n.scale ? '(has scale!)' : ''}`);
  }
}

let bad = false;
if (missing.length) { console.error('  ✗ MISSING node(s): ' + missing.join(', ')); bad = true; }
if (quantized) {
  console.error('  ✗ Geometry is quantized/meshopt-compressed — this moves the wing');
  console.error('    pivots off the hinges and BREAKS the fold. Re-run without it.');
  bad = true;
}
if (bad) process.exit(1);
console.log('  ✓ OK — fold node names present, geometry un-quantized.');

function fail(m) { console.error(m); process.exit(1); }
