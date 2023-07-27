let fs = require('fs')
const express = require('express')
const bodyParser = require('body-parser')
const formidable = require('formidable')
const cors = require('cors')
const path = require('path')
const util = require('util')
const checkDiskSpace = require('check-disk-space')
let { VideoCompressor, progressMap } = require('./src/VideoCompressor')
const _config = require('./src/config')

const port = 29678

const app = express()
app.use(cors({
    origin: '*',
}))

let jsonParser = bodyParser.json({ strict: false })
app.use(jsonParser)

app.get('/version', (req, res) => {
    let { version, ffmpegPath, ffprobePath } = _config
    res.send({ version, ffmpegPath, ffprobePath })
})

app.get('/ffmpeg/stats', async (req, res, next) => {
    const { ffmpegPath, ffprobePath, oldFfmpegPath, oldFfprobePath } = _config
    const stat = util.promisify(fs.stat)
    try {
        const ffmpegOldStats = await stat(oldFfmpegPath)
        const ffprobeOldStats = await stat(oldFfprobePath)
        const ffmpegStats = await stat(ffmpegPath)
        const ffprobeStats = await stat(ffprobePath)
        res.send({
            oldFfmpegPath, oldFfprobePath, ffmpegPath, ffprobePath,
            ffmpegOldStats, ffprobeOldStats, ffmpegStats, ffprobeStats
        })
    } catch (error) {
        return next(error)
    }
})

// Upload file
app.put('/', (req, res, next) => {
    const KB_PER_GIGABYTE = 1024 * 1024 * 1024
    let maxFileSize = 50 * KB_PER_GIGABYTE
    let { videosPath } = _config
    let uploadDir = videosPath
    const form = formidable({ multiples: true, maxFileSize, uploadDir })
    form.parse(req, async (err, fields, files) => {
        if (err) {
            if (err.message.startsWith('maxFileSize exceeded')) {
                err.statusCode = 413    // Payload too large
            }
            return next(err)
        }

        if (!files.file) {
            let error = new Error("Missing field 'file'.")
            error.statusCode = 400
            return next(error)
        }

        let { path } = files.file
        res.send({ filePath: path })
    })
})

// retrieve file
app.get('/', async (req, res, next) => {
    let { filePath } = req.query
    if (!filePath) {
        let error = new Error('Missing query parameter "filePath".')
        error.statusCode = 400
        return next(error)
    }

    res.promisified = util.promisify(res.sendFile)  // Do not lose 'this' context.
    try {
        await res.promisified(filePath)
    } catch (error) {
        return next(error)
    }
})

// get size of file
app.get('/metadata', async (req, res, next) => {
    let { filePath } = req.query
    if (!filePath) {
        let error = new Error('Missing query parameter "filePath".')
        error.statusCode = 400
        return next(error)
    }

    try {
        let stat = util.promisify(fs.stat)
        let stats = await stat(filePath)
        res.send({ filePath, size: stats.size })
    } catch (error) {
        return next(error)
    }
})

app.get('/freeSpace', async (req, res, next) => {
    let space = await checkDiskSpace(_config.videosPath)
    res.send({ free: space.free })
})

app.delete('/', async (req, res, next) => {
    let { filePath } = req.query
    if (filePath === undefined) {
        let error = new Error('Missing query parameter "filePath".')
        error.statusCode = 400
        return next(error)
    }

    progressMap.delete(filePath)
    try {
        let unlink = util.promisify(fs.unlink)
        await unlink(filePath)
    } catch (error) {
        // File probably doesn't exist
        console.error(error)
    }
    res.send({ result: 'ok' })
})

// Check on progress of compression or concatenation.
app.get('/progress', (req, res, next) => {
    let { filePath } = req.query
    if (!filePath) {
        let error = new Error('Missing query parameter "filePath".')
        error.statusCode = 400
        return next(error)
    }

    let entry = progressMap.get(filePath)
    if (!entry) {
        let error = new Error('Does not exist')
        error.statusCode = 404
        return next(error)
    }

    let { percent, finished, error } = entry
    if (error) {
        return res.send({ error })
    }
    return res.send({ percent, finished })
})

// Start compressing the file at filePath using the passed parameters.
// Return the path for the (eventual) resulting file.
app.put('/compress', async (req, res, next) => {
    let { filePath, ffmpegParameters } = req.body
    try {
        validateCompressionFields(req)
    } catch (error) {
        return next(error)
    }

    let { videosPath } = _config
    let outputPath = path.join(videosPath, `${new Date().getTime()}.mp4`)
    res.send({ filePath: outputPath })

    let compressor = new VideoCompressor()
    await compressor.compress(filePath, outputPath, ffmpegParameters)
})

function validateCompressionFields(req) {
    let { filePath, ffmpegParameters  } = req.body
    if (filePath === undefined) {
        let error = new Error('Malformed data')
        error.statusCode = 400
        throw error
    }

    if (ffmpegParameters !== undefined) {
        let { inputOptions, outputOptions, audioFilters, videoFilters, complexFilter, complexFilterOutputMapping } = ffmpegParameters
        if (inputOptions !== undefined && inputOptions.length === undefined
            || outputOptions !== undefined && outputOptions.length === undefined
            || audioFilters !== undefined && audioFilters.length === undefined
            || videoFilters !== undefined && videoFilters.length === undefined
            || complexFilter !== undefined && complexFilter.length === undefined
            || complexFilterOutputMapping !== undefined && complexFilterOutputMapping.length === undefined
        ) {
            let error = new Error('Malformed data')
            error.statusCode = 400
            throw error
        }
    }
}

// Concatenate a list of files.
// They must all have the same video diminensions and codec.
app.put('/concatenate', async (req, res, next) => {
    let { filePaths } = req.body

    if (filePaths === undefined || filePaths.length === undefined) {
        let error = new Error('Malformed data')
        error.statusCode = 400
        return next(error)
    }

    let { videosPath } = _config
    let outputPath = path.join(videosPath, `${new Date().getTime()}.mp4`)
    res.send({ filePath: outputPath })

    let compressor = new VideoCompressor()
    await compressor.concatenate(filePaths, outputPath)
})

app.use((error, req, res, next) => {
    if (res.headersSent) {
        // pass control to express' default error handler
        return next(error)
    }
    let statusCode = error.statusCode || 500
    let errorMessage = error.stack || error
    console.error(`${statusCode}: ${errorMessage}`)
    console.error('')   // line between error messages
    return res.status(statusCode).json({ error: error.toString() })
})

async function startServer() {
    await initialize()
    app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`)
    })
}

async function initialize() {
    try {
        let { resourcesPath, videosPath } = _config
        let mkdir = util.promisify(fs.mkdir)
        let rmdir = util.promisify(fs.rm)
        await mkdir(resourcesPath, { recursive: true })
        if (fs.existsSync(videosPath)) {
            await rmdir(videosPath, { recursive: true })   // Remove any old videos
        }
        await mkdir(videosPath, { recursive: true })
        console.log('Directory created successfully.')
        await copyResources()
    } catch (err) {
        return console.error(err)
    }
}

// Copy ffmpeg/ffprobe to TEMP directory on local filesystem
async function copyResources() {
    let { oldFfmpegPath, oldFfprobePath, ffmpegPath, ffprobePath, platform } = _config

    let shouldCopyResources = await versionFileIsOlderThanServer()
    if (shouldCopyResources) {
        console.log('Copy resources')

        if (platform === 'linux') {
            await copyFile('/usr/bin/ffmpeg', ffmpegPath)
            await copyFile('/usr/bin/ffprobe', ffmpegPath)
        } else {
            await copyFile(oldFfmpegPath, ffmpegPath)
            await chMod(ffmpegPath, 0o777)
    
            await copyFile(oldFfprobePath, ffprobePath)
            await chMod(ffprobePath, 0o777)
        }
        await createVersionFile()
    }
}

async function chMod(outputPath, mode) {
    return new Promise((resolve, reject) => {
        fs.chmod(outputPath, mode, (error) => {
            if (error) {
                reject(error)
                return
            }
            resolve()
        })
    })
}

async function copyFile(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        let readable = fs.createReadStream(inputPath)
        let writable = fs.createWriteStream(outputPath)
        readable.on('end', () => {
            resolve()
        })
        readable.on('error', (err) => {
            reject(err)
        })
        readable.pipe(writable)
    })
}

async function versionFileIsOlderThanServer() {
    return new Promise((resolve, reject) => {
        let { resourcesPath, version } = _config
        let versionFilePath = path.join(resourcesPath, '/version.txt')
        fs.readFile(versionFilePath, 'utf8', (err, data) => {
            if (err) {
                return resolve(true)
            }

            return resolve(data !== version)
        })
    })
}

async function createVersionFile() {
    return new Promise((resolve, reject) => {
        let { resourcesPath, version } = _config
        let versionFilePath = path.join(resourcesPath, '/version.txt')
        fs.writeFile(versionFilePath, version, (err) => {
            if (err) {
                return reject(err)
            }
            return resolve()
        })
    })
}

startServer()