let os = require('os')
let path = require('path')

const tmpDirectory = path.join(os.tmpdir(), '/compression-server')
console.log(`Temporary directory: ${tmpDirectory}`)

const resourcesPath = path.join(tmpDirectory, '/resources')
const videosPath = path.join(tmpDirectory, '/videos')

const getFileExtension = () => os.platform() === 'win32' ? '.exe' : ''

let platform = os.platform() === 'win32' ? 'win32' : 'macos'

const oldFfmpegPath = path.join(__dirname, `/extraResources/${platform}/ffmpeg-x64${getFileExtension()}`)
const oldFfprobePath = path.join(__dirname, `/extraResources/${platform}/ffprobe-x64${getFileExtension()}`)
const ffmpegPath = path.join(resourcesPath, `/ffmpeg-x64${getFileExtension()}`)
const ffprobePath = path.join(resourcesPath, `/ffprobe-x64${getFileExtension()}`)

const version = '1.0'

module.exports = { resourcesPath, videosPath, oldFfmpegPath, oldFfprobePath, ffmpegPath, ffprobePath, version }