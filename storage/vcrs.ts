import { ensureDir, readJson, writeJson } from 'fs-extra'
import { readdir } from 'fs/promises'
import { basename, join, resolve } from 'path'
import Bottleneck from 'bottleneck'
import { ListVcrFilesArgs, ListVcrFilesResponse, RetrieveVcrsArgs, RetrieveVcrsResponse, StoreVcrArgs, StoreVcrResponse, VideoCacheRecord } from './vcrs.d'
import { readJsonCatchMissing } from './utils'

const composeVideoCacheRecordFilename = (_id: string): {
    project: string,
    portion: string,
    videoId: string,
    filename: string
} => {
    // BGSL_БЖЕ__230601_064416-230601_065151-240327_114822-2 <-- 'BGSL_БЖЕ/230601_064416/230601_065151/240327_114822-2'
    const [project, portion, ...videoIdParts] = _id.split('/')
    const videoId = videoIdParts.join('/')
    const filename = `${project}__${portion}.sltt-vcrs`
    return { project, portion, filename, videoId }
}

// Map to store batchers for each fullPath
const pathBatchers = new Map<string, Bottleneck.Batcher>()

export async function storeVcr(videoCacheRecordsPath: string, { clientId, videoCacheRecord }: StoreVcrArgs ): Promise<StoreVcrResponse> {
    const { _id } = videoCacheRecord
    const { filename, project, videoId } = composeVideoCacheRecordFilename(_id)
    const fullClientPath = join(videoCacheRecordsPath, clientId, project)
    await ensureDir(fullClientPath)
    const fullPath = join(fullClientPath, filename)

    // Get or create a batcher for the specific fullPath
    if (!pathBatchers.has(fullPath)) {
        const batcher = new Bottleneck.Batcher({
            maxTime: 1000, // Maximum time to wait before processing a batch
            maxSize: 1000  // Maximum number of items in a batch
        })

        // Handle batches for this fullPath
        batcher.on('batch', async (batch) => {
            const vcrsUpdated = {}

            // Collect updates for this fullPath
            for (const { videoId, videoCacheRecord } of batch) {
                vcrsUpdated[videoId] = videoCacheRecord
            }

            // Process the updates for this fullPath
            try {
                const vcrsOrig = readJsonCatchMissing<{ [videoId: string]: VideoCacheRecord }, Record<string, never>>(fullPath, {})
                const vcrs = { ...vcrsOrig, ...vcrsUpdated }
                await writeJson(fullPath, vcrs)
            } catch (error) {
                console.error('An error occurred:', error.message)
                throw error
            }
        })

        pathBatchers.set(fullPath, batcher)
    }

    const batcher = pathBatchers.get(fullPath)

    // Add the update to the batcher
    batcher.add({ fullPath, videoId, videoCacheRecord })

    return { fullPath }
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

export async function listVcrFiles(videoCacheRecordsPath: string, { clientId, project }: ListVcrFilesArgs ): Promise<ListVcrFilesResponse> {
    try {
        // empty project means all projects
        const fullClientPath = join(videoCacheRecordsPath, clientId, project)
        const filenames = await getFiles(fullClientPath)
        // get base filenames
        const result = filenames.filter(filename => filename.endsWith('.sltt-vcrs')).map(filename => basename(filename))
        result.sort() // just in case it's not yet by name
        return result
    } catch (error) {
        if (error.code === 'ENOENT') {
            return []
        } else {
            console.error('An error occurred:', error.message)
            throw error
        }
    }
}

export async function retrieveVcrs(videoCacheRecordsPath: string, { clientId, filename }: RetrieveVcrsArgs): Promise<RetrieveVcrsResponse> {
    const [project] = filename.split('__')
    const fullPath = join(videoCacheRecordsPath, clientId, project, filename)
    return readJsonCatchMissing<RetrieveVcrsResponse, null>(fullPath, null)
}
