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

const tmpDirectory = path.join(os.tmpdir(), '/sltt-app/server-29678')
console.log(`sltt-app compressor server temp directory: ${tmpDirectory}`)

const resourcesPath = path.join(tmpDirectory, '/resources')
const videosPath = path.join(tmpDirectory, '/videos')

const getFileExtension = () => os.platform() === 'win32' ? '.exe' : ''

let platform = os.platform() === 'win32' ? 'win32' : 'macos'

// const srcFfmpegPath = path.join(__dirname, `/extraResources/${platform}/ffmpeg-x64${getFileExtension()}`)
const srcFfmpegPath = require('ffmpeg-static').replace(
    'app.asar',
    'app.asar.unpacked'
)

// const srcFfmpegPath = path.join(process.resourcesPath, 'node_modules/ffmpeg-static/ffmpeg.exe')

console.log(`srcFfmpegPath: ${srcFfmpegPath}`)

const ffmpegPath = path.join(resourcesPath, `/ffmpeg-x64${getFileExtension()}`)

const version = '2.0.0'
console.log(`sltt-app compressor server version: ${version}`)

module.exports = { resourcesPath, videosPath, srcFfmpegPath, ffmpegPath, version, platform }