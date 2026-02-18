#!/usr/bin/env node

const { existsSync } = require('fs')
const { execSync } = require('child_process')

function run(command) {
  try {
    return {
      ok: true,
      output: execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    }
  } catch (error) {
    const stdout = error?.stdout ? String(error.stdout).trim() : ''
    const stderr = error?.stderr ? String(error.stderr).trim() : ''
    return {
      ok: false,
      output: [stdout, stderr].filter(Boolean).join('\n') || error.message
    }
  }
}

function printSection(title) {
  console.log(`\n=== ${title} ===`)
}

function printCheck(label, result) {
  const status = result.ok ? 'OK' : 'FAIL'
  console.log(`${label}: ${status}`)
  if (result.output) {
    console.log(result.output)
  }
}

console.log('sltt-app toolchain doctor')
console.log(`platform: ${process.platform}`)
console.log(`node: ${process.version}`)

printSection('Xcode / CLT')
const xcodePath = run('xcode-select -p')
printCheck('xcode-select -p', xcodePath)

const clangVersion = run('clang --version | head -n 1')
printCheck('clang --version', clangVersion)

const sourceLocationChecks = [
  '/Library/Developer/CommandLineTools/usr/include/c++/v1/source_location',
  '/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/include/c++/v1/source_location'
]
for (const candidate of sourceLocationChecks) {
  const hasHeader = existsSync(candidate)
  console.log(`${candidate}: ${hasHeader ? 'FOUND' : 'MISSING'}`)
}

printSection('npm TLS config')
printCheck('npm config get registry', run('npm config get registry'))
printCheck('npm config get strict-ssl', run('npm config get strict-ssl'))
printCheck('npm config get cafile', run('npm config get cafile'))
printCheck('npm config get proxy', run('npm config get proxy'))
printCheck('npm config get https-proxy', run('npm config get https-proxy'))

printSection('Environment TLS vars')
const envVars = ['NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTPS_PROXY', 'HTTP_PROXY']
for (const key of envVars) {
  const value = process.env[key]
  console.log(`${key}=${value && value.length ? value : '(empty)'}`)
}

printSection('Network checks')
printCheck('curl npmjs.org tarball', run('curl -I https://registry.npmjs.org/nan/-/nan-2.25.0.tgz | head -n 1'))
printCheck(
  'node https npmjs.org tarball',
  run("node -e \"require('https').get('https://registry.npmjs.org/nan/-/nan-2.25.0.tgz',res=>{console.log('status',res.statusCode);res.resume();}).on('error',e=>{console.error(e.code, e.message);process.exit(1);});\"")
)

printSection('Summary')
if (process.platform !== 'darwin') {
  console.log('Non-macOS platform: mac toolchain checks may be skipped.')
} else {
  const hasSourceLocation = sourceLocationChecks.some((candidate) => existsSync(candidate))
  const clangMajorMatch = clangVersion.output.match(/Apple clang version (\d+)\./)
  const clangMajorVersion = clangMajorMatch ? Number(clangMajorMatch[1]) : 0

  if (!hasSourceLocation || clangMajorVersion < 15) {
    console.log('Toolchain likely too old for Electron native rebuild. Install latest Xcode and switch xcode-select.')
  } else {
    console.log('Toolchain looks compatible for Electron native rebuild.')
  }
}
