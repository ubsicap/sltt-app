/* eslint-disable prettier/prettier */
let os = require('os')
let path = require('path')

// NOTE: to enable cmd/cli console output from electron main window (in Windows):
// > set ELECTRON_ENABLE_LOGGING=true
// > cd C:\Users\{user}\AppData\Local\Programs\sltt-app
// > sltt-app.exe

// To make sure the express service is running:
// http://localhost:29678/version

// To make sure ffmpeg files got installed as expected:
// http://localhost:29678/ffmpeg/stats

const tmpDirectory = path.join(os.tmpdir(), '/compression-server')
console.log(`Temporary directory: ${tmpDirectory}`)

const resourcesPath = path.join(tmpDirectory, '/resources')
const videosPath = path.join(tmpDirectory, '/videos')

const getFileExtension = () => os.platform() === 'win32' ? '.exe' : ''

let platform = os.platform() === 'win32' ? 'win32' : 'macos'

// const srcFfmpegPath = path.join(__dirname, `/extraResources/${platform}/ffmpeg-x64${getFileExtension()}`)
// const srcFfprobePath = path.join(__dirname, `/extraResources/${platform}/ffprobe-x64${getFileExtension()}`)
// NOTE: including ffmpeg-static as a dependency makes for a large install package
// For now just make paths specific to windows installation
// TODO make paths work for linux and macos

const srcFfmpegPath = require('ffmpeg-static').replace(
    'app.asar',
    'app.asar.unpacked'
);
const srcFfprobePath = require('ffprobe-static').path.replace(
    'app.asar',
    'app.asar.unpacked'
);
// const srcFfmpegPath = path.join(process.resourcesPath, 'node_modules/ffmpeg-static/ffmpeg.exe')
// const srcFfprobePath = path.join(process.resourcesPath, 'node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe')

console.log(`srcFfmpegPath: ${srcFfmpegPath}`)
console.log(`srcFfprobePath: ${srcFfprobePath}`)

const ffmpegPath = path.join(resourcesPath, `/ffmpeg-x64${getFileExtension()}`)
const ffprobePath = path.join(resourcesPath, `/ffprobe-x64${getFileExtension()}`)

const version = '1.1'

module.exports = { resourcesPath, videosPath, srcFfmpegPath, srcFfprobePath, ffmpegPath, ffprobePath, version, platform }