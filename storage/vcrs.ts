import { ensureDir, writeJson } from 'fs-extra'
import { basename, join } from 'path'
import Bottleneck from 'bottleneck'
import { ListVcrFilesArgs, ListVcrFilesResponse, RetrieveVcrsArgs, RetrieveVcrsResponse, StoreVcrArgs, StoreVcrResponse, VideoCacheRecord } from './vcrs.d'
import { getFiles, isNodeError, readJsonCatchMissing } from './utils'
import { stringify as safeStableStringify } from 'safe-stable-stringify'

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

export async function storeVcr(videoCacheRecordsPath: string, { clientId, videoCacheRecord, batchMaxTime, batchMaxSize }: StoreVcrArgs ): Promise<StoreVcrResponse> {
    const { _id } = videoCacheRecord
    const { filename, project, videoId } = composeVideoCacheRecordFilename(_id)
    const fullClientPath = join(videoCacheRecordsPath, clientId, project)
    await ensureDir(fullClientPath)
    const fullPath = join(fullClientPath, filename)

    // Get or create a batcher for the specific fullPath
    if (!pathBatchers.has(fullPath)) {
        const batcher = new Bottleneck.Batcher({
            maxTime: batchMaxTime ?? 10, // Maximum time to wait before processing a batch
            maxSize: batchMaxSize ?? 10, // Maximum number of items in a batch
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
                const vcrsOrig = await readJsonCatchMissing<{ [videoId: string]: VideoCacheRecord }, Record<string, never>>(fullPath, {})
                const vcrs = { ...vcrsOrig, ...vcrsUpdated }
                if (safeStableStringify(vcrs) === safeStableStringify(vcrsOrig)) {
                    return
                }
                await writeJson(fullPath, vcrs)
            } catch (error: unknown) {
                console.error('An error occurred:', (error as Error).message)
                throw error
            }
        })

        pathBatchers.set(fullPath, batcher)
    }

    const batcher = pathBatchers.get(fullPath)
    if (!batcher) {
        throw new Error('Batcher not found')
    }

    // Add the update to the batcher
    batcher.add({ fullPath, videoId, videoCacheRecord })

    return { fullPath }
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
    } catch (error: unknown) {
        if (isNodeError(error) && error.code === 'ENOENT') {
            return []
        } else {
            console.error('An error occurred:', (error as Error).message)
            throw error
        }
    }
}

export async function retrieveVcrs(videoCacheRecordsPath: string, { clientId, filename }: RetrieveVcrsArgs): Promise<RetrieveVcrsResponse> {
    const [project] = filename.split('__')
    const fullPath = join(videoCacheRecordsPath, clientId, project, filename)
    return await readJsonCatchMissing<RetrieveVcrsResponse, Record<string, never>>(fullPath, {})
}
