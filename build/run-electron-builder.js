#!/usr/bin/env node

const { execSync } = require('child_process')

const env = { ...process.env }

const resolveNodeGypPython = () => {
  const candidates = ['python3.11', 'python3.10', 'python3.9']

  for (const candidate of candidates) {
    try {
      const pythonPath = execSync(`command -v ${candidate}`, { encoding: 'utf8' }).trim()
      if (pythonPath) {
        return pythonPath
      }
    } catch {
      // ignore and continue to next candidate
    }
  }

  return null
}

if (process.platform === 'darwin') {
  const pythonPath = resolveNodeGypPython()
  if (pythonPath) {
    env.npm_config_python = pythonPath
    env.PYTHON = pythonPath
    console.log(`[builder] Using PYTHON=${pythonPath}`)
  } else {
    console.warn('[builder] No compatible Python (3.9-3.11) found for node-gyp. Native module rebuild may fail on Python 3.12+.')
  }

  try {
    const sdkPath = execSync('xcrun --show-sdk-path', { encoding: 'utf8' }).trim()
    if (sdkPath) {
      env.SDKROOT = sdkPath
      env.CPLUS_INCLUDE_PATH = `${sdkPath}/usr/include/c++/v1`
      console.log(`[builder] Using SDKROOT=${env.SDKROOT}`)
      console.log(`[builder] Using CPLUS_INCLUDE_PATH=${env.CPLUS_INCLUDE_PATH}`)
    }
  } catch {
    console.warn('[builder] Unable to resolve SDK path with xcrun; continuing without SDK env overrides.')
  }
}

const args = process.argv.slice(2).join(' ')
execSync(`electron-builder ${args}`, {
  stdio: 'inherit',
  env,
  shell: true
})
