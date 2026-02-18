#!/usr/bin/env node

const { existsSync } = require('fs')
const { join } = require('path')
const { execSync } = require('child_process')

function log(message) {
  console.log(`[preflight] ${message}`)
}

function fail(message) {
  console.error(`\n[preflight] ${message}\n`)
  process.exit(1)
}

if (process.platform !== 'darwin') {
  log('Skipping macOS toolchain check (non-macOS platform).')
  process.exit(0)
}

let developerDir = ''
let clangVersionOutput = ''
let sdkPath = ''

try {
  developerDir = execSync('xcode-select -p', { encoding: 'utf8' }).trim()
} catch {
  fail('Xcode Command Line Tools are not configured. Run: xcode-select --install')
}

try {
  clangVersionOutput = execSync('clang --version', { encoding: 'utf8' }).trim()
} catch {
  fail('`clang` was not found. Install Command Line Tools: xcode-select --install')
}

try {
  sdkPath = execSync('xcrun --show-sdk-path', { encoding: 'utf8' }).trim()
} catch {
  sdkPath = ''
}

const clangMajorMatch = clangVersionOutput.match(/Apple clang version (\d+)\./)
const clangMajorVersion = clangMajorMatch ? Number(clangMajorMatch[1]) : 0

const headerCandidates = [
  join(developerDir, 'usr', 'include', 'c++', 'v1', 'source_location'),
  sdkPath ? join(sdkPath, 'usr', 'include', 'c++', 'v1', 'source_location') : '',
  '/Library/Developer/CommandLineTools/usr/include/c++/v1/source_location',
  '/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1/source_location',
  '/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/include/c++/v1/source_location'
].filter(Boolean)

const hasSourceLocationHeader = headerCandidates.some((candidate) => existsSync(candidate))

if (!hasSourceLocationHeader || clangMajorVersion < 15) {
  const missingBits = []
  if (!hasSourceLocationHeader) {
    missingBits.push('missing libc++ header `<source_location>`')
  }
  if (clangMajorVersion < 15) {
    missingBits.push(`Apple clang ${clangMajorVersion || 'unknown'} is too old (need >= 15)`) 
  }

  fail(
    `macOS toolchain is too old for Electron native rebuild (${missingBits.join(', ')}).\n` +
      'Update toolchain, then retry:\n' +
      '  1) Install latest Xcode or CLT\n' +
      '  2) sudo xcode-select -s /Applications/Xcode.app/Contents/Developer\n' +
      '  3) sudo xcodebuild -license accept\n' +
      '  4) npm install\n\n' +
      `Detected developer dir: ${developerDir}\n` +
      `Detected clang: ${clangVersionOutput.split('\n')[0]}`
  )
}

log(`Toolchain OK (${clangVersionOutput.split('\n')[0]}).`)
