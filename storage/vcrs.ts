import { ensureDir, readJson, writeJson } from "fs-extra"
import { readdir } from "fs/promises"
import { join, resolve } from "path"

const composeVideoCacheRecordFilename = (_id: string): {
    project: string,
    portion: string,
    videoId: string,
    filename: string
} => {
    // BGSL_БЖЕ__230601_064416-230601_065151-240327_114822-2 <-- "BGSL_БЖЕ/230601_064416/230601_065151/240327_114822-2"
    const [project, portion, ...videoIdParts] = _id.split('/')
    const videoId = videoIdParts.join('/')
    const filename = `${project}__${portion}.sltt-vcrs`
    return { project, portion, filename, videoId }
}

export async function storeVcr(videoCachRecordsPath: string, clientId: string, videoCacheRecord: { _id: string, uploadeds: boolean[] }): Promise<{ fullPath: string }> {
    const { _id } = videoCacheRecord
    const { filename, project, videoId } = composeVideoCacheRecordFilename(_id)
    const fullClientPath = join(videoCachRecordsPath, clientId, project)
    await ensureDir(fullClientPath)
    const fullPath = join(videoCachRecordsPath, filename)
    // first read json file, then update, then write back
    let vcrsUpdated = { 
        [videoId]: videoCacheRecord
    }
    try {
        const vcrs = await readJson(fullPath)
        vcrsUpdated = { ...vcrs, ...vcrsUpdated }
    } catch (error) {
        if (error.code === 'ENOENT') {
            // file doesn't exist, create it below
        }
    }
    try {
        await writeJson(fullPath, vcrsUpdated)
        return { fullPath }
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null
        } else {
            // Handle other possible errors
            console.error('An error occurred:', error.message)
            throw error
        }  
    }
}

// from https://stackoverflow.com/a/45130990/24056785
async function getFiles(dir): Promise<string[]> {
    const dirents = await readdir(dir, { withFileTypes: true })
    const files = await Promise.all(dirents.map((dirent) => {
        const res = resolve(dir, dirent.name)
        return dirent.isDirectory() ? getFiles(res) : res
    }))
    return Array.prototype.concat(...files)
}
