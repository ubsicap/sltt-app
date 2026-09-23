#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoOwner = 'ubsicap';
const repoName = 'sltt-app';

const pkg = require(path.resolve(__dirname, '..', 'package.json'));
const versionTag = pkg.version;
const distDir = path.resolve(__dirname, '..', 'dist');

function findFiles() {
  if (!fs.existsSync(distDir)) return [];
  const all = fs.readdirSync(distDir);
  const picks = all.filter((f) => {
    if (f === 'latest-mac.yml') return true;
    if (!f.includes(versionTag)) return false;
    // include mac-related artifacts containing the version
    return /dmg|mac|blockmap/.test(f);
  });
  return picks.map((f) => path.join(distDir, f));
}

const files = findFiles();
if (files.length === 0) {
  console.error('No mac release artifacts found in', distDir);
  process.exit(1);
}

console.log('Uploading release v' + versionTag + ' with files:');
files.forEach((f) => console.log('  ' + f));

const args = ['release', 'upload', `v${versionTag}`, ...files, '-R', `${repoOwner}/${repoName}`, '--clobber'];
const res = spawnSync('gh', args, { stdio: 'inherit' });
if (res.error) {
  console.error('Failed to run `gh`:', res.error.message || res.error);
  process.exit(1);
}
process.exit(res.status);
