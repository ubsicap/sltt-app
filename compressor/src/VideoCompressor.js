let fs = require('fs')
let path = require('path')
let util = require('util')
let ffmpeg = require('fluent-ffmpeg')
const _config = require('./config')

const debug = true

let { ffmpegPath } = _config
ffmpeg.setFfmpegPath(ffmpegPath)

const bytesToMB = bytes => (bytes / (1024 * 1024)).toFixed(1)

class VideoCompressor {
    compress = async (inputFilePath, outputFilePath, ffmpegParameters) => {
        progressMap.set(outputFilePath, new ProgressEntry())
        let progressTracker = new ProgressNotifier(outputFilePath)
        try {
            let s = fs.statSync(inputFilePath)
            const filePathWithParentFolder = `${inputFilePath.split(path.sep).slice(-2).join(path.sep)}`
            console.log(`Compress starting: ${filePathWithParentFolder} (${bytesToMB(s.size)}MB)`)
            
            let stats = await FfmpegWrapper.compress(inputFilePath, outputFilePath, ffmpegParameters, progressTracker)
            
            let newFileSizeMB = bytesToMB(stats.size)
            console.log(`Compress finished: (${newFileSizeMB}MB)`)
            progressTracker.onDone()
        } catch (error) {
            progressTracker.onError(error)
        }
    }

    concatenate = async (filePaths, outputFilePath) => {
        progressMap.set(outputFilePath, new ProgressEntry())
        let progressTracker = new ProgressNotifier(outputFilePath)
        try {
            const filePathWithParentFolder = `${outputFilePath.split(path.sep).slice(-2).join(path.sep)}`
            console.log(`Join segments [${filePaths.length}, ${filePathWithParentFolder}]`)
            
            const clientDir = path.dirname(filePaths[0])
            let concatTextFilePath = path.join(clientDir, `${new Date().getTime()}-concat.txt`)
            await FfmpegWrapper.createConcatFile(filePaths, concatTextFilePath)
            let stats = await FfmpegWrapper.concatenate(concatTextFilePath, outputFilePath)
            
            try {
                let unlink = util.promisify(fs.unlink)
                await unlink(concatTextFilePath)
            } catch (error) {
                // File probably doesn't exist
                console.error(error)
            }

            let newFileSizeMB = bytesToMB(stats.size)
            console.log(`Segments joined (${newFileSizeMB}MB)`)
            progressTracker.onDone()
        } catch (error) {
            progressTracker.onError(error)
        }
    }
}

class FfmpegWrapper {
    static compress = async (inputFilePath, outputFilePath, compressionParams, progressTracker) => {
        let { inputOptions, outputOptions, audioFilters, videoFilters, complexFilter, complexFilterOutputMapping } = compressionParams

        let command = ffmpeg().input(inputFilePath)
        if (inputOptions !== undefined) {
            command = command.inputOptions(inputOptions)
        }

        if (audioFilters !== undefined) {
            command = command.audioFilters(audioFilters)
        }

        if (videoFilters !== undefined) {
            command = command.videoFilters(videoFilters)
        }

        if (complexFilter !== undefined && complexFilter.length > 0) {
            if (complexFilterOutputMapping !== undefined && complexFilterOutputMapping.length > 0) {
                command = command.complexFilter(complexFilter, complexFilterOutputMapping)
            } else {
                command = command.complexFilter(complexFilter)
            }
        }

        if (outputOptions !== undefined) {
            command = command.outputOptions(outputOptions)
        }

        return new Promise((resolve, reject) => {
            return command.output(outputFilePath)
                // .on('start', function (commandLine) {
                //     console.log('start Ffmpeg: ' + commandLine);
                // })
                .on('progress', progress => {
                    progressTracker.onProgress(progress)
                })
                .on('end', () => {
                    fs.stat(outputFilePath, (err, stats) => {
                        if (err) {
                            reject()
                            return
                        }
                        resolve(stats)
                    })
                })
                .on('error', reject)
                .run()
        })
    }

    static createConcatFile = async (filePaths, outputFilePath) => {
        return new Promise((resolve, reject) => {
            let fileContent = ''
            for (let filePath of filePaths) {
                fileContent = fileContent.concat(`file '${filePath}'\n`)
            }
            fs.writeFile(outputFilePath, fileContent, err => {
                if (err) {
                    reject(err)
                    return
                }
                resolve()
            })
        })
    }

    static concatenate = async (inputTextFilePath, outputFilePath) => {
        return new Promise((resolve, reject) => {
            return ffmpeg()
                .input(inputTextFilePath)
                .inputOptions(['-safe 0'])
                .inputFormat('concat')
                .outputOptions(['-c copy'])
                .output(outputFilePath)
                .on('end', () => {
                    fs.stat(outputFilePath, (err, stats) => {
                        if (err) {
                            reject()
                            return
                        }
                        resolve(stats)
                    })
                })
                .on('error', reject)
                .run()
        })
    }
}

// <string, ProgressEntry>
// id -> status of compression
let progressMap = new Map()

class ProgressEntry {
    percent = 0
    finished = false
    error = ''
}

class ProgressNotifier {
    id

    constructor(id) {
        this.id = id
        this.onProgress = this.onProgress.bind(this)
        this.onDone = this.onDone.bind(this)
        this.onError = this.onError.bind(this)
    }

    onProgress(progress) {
        let { id } = this
        let percent = Math.round(progress.percent)
        if (isNaN(percent) || !isFinite(percent)) {
            return
        }
        let entry = progressMap.get(id)
        if (!entry) {
            return
        }
        entry.percent = percent
        progressMap.set(id, entry)
    }

    onDone() {
        let { id } = this
        let entry = progressMap.get(id)
        if (!entry) {
            return
        }
        entry.finished = true
        entry.percent = 100
        progressMap.set(id, entry)
    }

    onError(error) {
        let { id } = this
        console.log(error)
        let entry = progressMap.get(id)
        if (!entry) {
            return
        }
        entry.error = error.toString()
        progressMap.set(id, entry)
    }
}

module.exports = { VideoCompressor, progressMap }