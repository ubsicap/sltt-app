/* eslint-disable prettier/prettier */
let os = require('os')
let path = require('path')

// NOTE: to enable cmd/cli console output from electron main window (in Windows):
// > set ELECTRON_ENABLE_LOGGING=true
// > cd C:\Users\{user}\AppData\Local\Programs\sltt-electron
// > sltt-electron.exe

// To make sure the express service is running:
// http://localhost:29678/version
// http://localhost:29678/ffmpeg/stats

const tmpDirectory = path.join(os.tmpdir(), '/compression-server')
console.log(`Temporary directory: ${tmpDirectory}`)

const resourcesPath = path.join(tmpDirectory, '/resources')
const videosPath = path.join(tmpDirectory, '/videos')

const getFileExtension = () => os.platform() === 'win32' ? '.exe' : ''

let platform = os.platform() === 'win32' ? 'win32' : 'macos'

// const oldFfmpegPath = path.join(__dirname, `/extraResources/${platform}/ffmpeg-x64${getFileExtension()}`)
// const oldFfprobePath = path.join(__dirname, `/extraResources/${platform}/ffprobe-x64${getFileExtension()}`)
const oldFfmpegPath = require('ffmpeg-static').replace(
    'app.asar',
    'app.asar.unpacked'
);
const oldFfprobePath = require('ffprobe-static').path.replace(
    'app.asar',
    'app.asar.unpacked'
);

console.log(`oldFfmpegPath: ${oldFfmpegPath}`)
console.log(`oldFfprobePath: ${oldFfprobePath}`)

const ffmpegPath = path.join(resourcesPath, `/ffmpeg-x64${getFileExtension()}`)
const ffprobePath = path.join(resourcesPath, `/ffprobe-x64${getFileExtension()}`)

const version = '1.0'

module.exports = { resourcesPath, videosPath, oldFfmpegPath, oldFfprobePath, ffmpegPath, ffprobePath, version, platform }