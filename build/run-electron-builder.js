#!/usr/bin/env node

const { execSync } = require('child_process')

const env = { ...process.env }

if (process.platform === 'darwin') {
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
