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

const debug = false

// Log request/response
debug && app.use((req, res, next) => {
    res.on('finish', () => {
        console.log(`***${req.method} ${req.originalUrl} ${res.statusCode}`)
    })
    next()
})

const app = express()
app.use(cors({
    origin: '*',
}))

let jsonParser = bodyParser.json({ strict: false })
app.use(jsonParser)

app.get('/version', (req, res) => {
    let { version, ffmpegPath, srcFfmpegPath } = _config
    res.send({ version, ffmpegPath, srcFfmpegPath })
})

app.get('/ffmpeg/stats', async (req, res, next) => {
    const { ffmpegPath, srcFfmpegPath } = _config
    const stat = util.promisify(fs.stat)
    try {
        const ffmpegOldStats = await stat(srcFfmpegPath)
        const ffmpegStats = await stat(ffmpegPath)
        res.send({
            srcFfmpegPath, ffmpegPath,
            ffmpegOldStats, ffmpegStats
        })
    } catch (error) {
        return next(error)
    }
})

// Upload file
app.put('/', async (req, res, next) => {
    await copyResources()

    const KB_PER_GIGABYTE = 1024 * 1024 * 1024
    let maxFileSize = 50 * KB_PER_GIGABYTE
    let { videosPath } = _config
    let uploadDir = videosPath
    const form = formidable({ multiples: true, maxFileSize, uploadDir })
    form.parse(req, async (err, fields, files) => {
        debug && console.log('put file', files.file && files.file.path, err)

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

app.get('/freeSpace', async (_req, res, /* next */) => {
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
       // If the entry is not found yet, we assume it is because the compression hasn't started yet.
        entry = { percent: 0, finished: false, error: '' }
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
    await copyResources()
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
// They must all have the same video dimensions and codec.
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
    await copyResources()
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
        const { videosPath } = _config
        if (fs.existsSync(videosPath)) {
            // If rmSync is available it is the preferred method ... otherwise use the older rmdirSync
            if (fs.rmSync) {
                fs.rmSync(videosPath, { recursive: true, force: true })
            } else {
                fs.rmdirSync(videosPath, { recursive: true })
            }
        }
        fs.mkdirSync(videosPath, { recursive: true })
        await copyResources()
    } catch (err) {
        return console.error(err)
    }
}

// Copy ffmpeg to TEMP directory on local filesystem.
// Not sure why this is necessary ... couldn't we just run the binaries from the resources directory?
// Maybe it is the only way to ensure that the files are executable (chMod)
async function copyResources() {
    let { srcFfmpegPath, ffmpegPath, videosPath } = _config

    if (await needToCopyFFFiles()) {
        console.log('Copy resources')

        let { resourcesPath } = _config
        if (!fs.existsSync(resourcesPath)) {
            fs.mkdirSync(resourcesPath, { recursive: true })
        }

        if (!fs.existsSync(videosPath)) {
            fs.mkdirSync(videosPath, { recursive: true })
        }

        await copyFile(srcFfmpegPath, ffmpegPath)
        await chMod(ffmpegPath, 0o777)

        // await copyFile(oldFfprobePath, ffprobePath)
        // await chMod(ffprobePath, 0o777)

        await createVersionFile()

        console.log('Copy resources done')
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

async function needToCopyFFFiles() {
    const { resourcesPath, version, ffmpegPath, videosPath /*, ffprobePath */ } = _config
    
    try {
        const versionFilePath = path.join(resourcesPath, '/version.txt')

        if (!fs.existsSync(versionFilePath)) return true
        if (!fs.existsSync(videosPath)) return true
        if (!fs.existsSync(ffmpegPath)) return true
        // if (!fs.existsSync(ffprobePath)) return true

        const data = fs.readFileSync(versionFilePath, 'utf8')
        if (data !== version) {
            console.log('Copy new version ffmpeg resources')
            return true
        }
    } catch (error) {
        console.log('Copy resources needed, error:', error)
        return true // if anything goes wrong, copy the files
    }

    return false
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