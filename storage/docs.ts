import { createHash } from 'crypto'
import { basename, join, parse, sep } from 'path'
import { existsSync } from 'fs'
import { readFile, writeFile, readdir, unlink, appendFile, stat, open } from 'fs/promises'
import { ensureDir, ensureFile, readJson, writeJson, read, close } from 'fs-extra'
import { sortBy } from 'lodash'
import { promisify } from 'util'
import { ListDocsArgs, ListDocsResponse, RemoteSeqDoc, RetrieveDocArgs, RetrieveDocResponse, StoreDocArgs, StoreDocResponse, SyncDocsArgs, SyncDocsResponse, SyncRemoteDocsArgs } from './docs.d'
import { readJsonCatchMissing } from './utils'


const readAsync = promisify(read)
const closeAsync = promisify(close)

async function readLastBytes(filePath: string, byteCount: number): Promise<Buffer> {
    // Open the file in read mode
    const fileHandle = await open(filePath, 'r')
    try {
        // Get the size of the file
        const fileStats = await stat(filePath)
        const fileSize = fileStats.size

        // Calculate the position to start reading from
        const startPosition = Math.max(0, fileSize - byteCount)

        // Create a buffer to hold the bytes
        const buffer = Buffer.alloc(byteCount)

        // Read the bytes from the file
        await readAsync(fileHandle.fd, buffer, 0, byteCount, startPosition)

        return buffer
    } finally {
        // Close the file
        await closeAsync(fileHandle.fd)
    }
}

const composeFilenameSafeDate = (modDate: string): string => {
    let dateStr = modDate // 2024/06/17 09:49:07.997Z
    // Replace slashes, spaces, and colons with underscores to make it filename-safe
    dateStr = dateStr.replace(/\//g, '-') // Replace slashes with hyphens
    dateStr = dateStr.replace(/ /g, '_') // Replace spaces with underscores
    dateStr = dateStr.replace(/:/g, '-') // Replace colons with hyphens
    // Handle milliseconds and 'Z' - replace '.' with '-' and remove 'Z'
    dateStr = dateStr.replace(/\./g, '-').replace(/Z$/, '')
    return dateStr // 2024-06-17_09-49-07-997
}

const decomponseFilenameSafeDate = (filenameSafeDate: string): string => {
    let [dateStr, timeStr] = filenameSafeDate.split('_') // 2024-06-17, 09-49-07-997 <-- 2024-06-17_09-49-07-997
    // Replace hyphens with slashes, spaces, and colons to make it filename-safe
    dateStr = dateStr.replace(/-/g, '/') // Replace hyphens with slashes
    timeStr = timeStr.replace(/-/g, ':') // Replace hyphens with colons
    // Handle milliseconds and 'Z' - replace '-' with '.' and add 'Z'
    timeStr = timeStr.replace(/-/g, '.').concat('Z')
    return `${dateStr} ${timeStr}` // 2024/06/17 09:49:07.997Z
}

const composeFilenameSafeId = (_id: string): string => {
    // GIVEN _id in format like plan_240617_094907/stg_240617_094910/tsk_240617_094912
    // Replace slashes with hyphens
    if (!_id) return 'no-id'
    const filenameSafeId1 = _id.replace(/\//g, '-') // plan_240617_094907-stg_240617_094910-tsk_240617_094912
    const fileNameExtra = composeFilename('9999/99/99 99:99:99.999Z', '', '999@99999.999', '999@99999.999', 999999999)
    const fileNameTrial1 = fileNameExtra.replace('no-id', filenameSafeId1)
    if (fileNameTrial1.length >= 255) {
        // if filename is too long, shorten each inner date_time to just the time component, but keep first and last parts of _id
        const abbreviatedId = _id.split('/').map((s, i, array) => (i > 0 && i < array.length - 1) ? s.split('_').slice(-1) : s).join('-')
        return abbreviatedId // plan_240617_094907-094910-tsk_240617_094912 <-- plan_240617_094907/stg_240617_094910/tsk_240617_094912
    } else {
        return filenameSafeId1 // plan_240617_094907-stg_240617_094910-tsk_240617_094912 <-- plan_240617_094907/stg_240617_094910/tsk_240617_094912
    }
}

const LOCAL_DOC_PREFIX = 'local-doc' // 9 characters...same as remote seq

const composeFilename = (modDate: string, _id: string, creator: string, modBy: string, remoteSeq: number): string => {
    const filenameSafeModDate = composeFilenameSafeDate(modDate)
    const filenameSafeId = composeFilenameSafeId(_id)
    const filenameSafeCreator = composeFilenameSafeEmail(creator)
    const filenameSafeModBy = modBy && composeFilenameSafeEmail(modBy) || 'no-mod-by'
    // make slot for remote and local nine characters so abbreviation logic is applied to both
    // this can make determining whether local has become remote based on the filename alone) 
    const filenameRemoteSeq = Number.isInteger(remoteSeq) ? `${`${remoteSeq}`.padStart(9, '0')}` : LOCAL_DOC_PREFIX
    const filename = `${filenameRemoteSeq}__${filenameSafeModDate}__${filenameSafeId}__${filenameSafeCreator}__${filenameSafeModBy}.sltt-doc`
    return filename
}

const decomposeRemoteSeq = (paddedRemoteSeq: string): string =>
    paddedRemoteSeq === 'local' ? '' : paddedRemoteSeq.replace(/^0+/, '')

const createMd5Hash = (s: string): string => createHash('md5').update(s).digest('hex').toString()
const createEmailHash = (email: string): string => createMd5Hash(email).substring(0, 16) // api uses this

const composeFilenameSafeEmail = (email: string): string => {
    return createEmailHash(email).substring(0, 8) // 8 characters will probably avoid collision within team 
}

const buildDocFolder = (docsFolder: string, project: string, isFromRemote: boolean): string => {
    const DOCS_FROM_REMOTE_PATH = 'remote'
    const DOCS_FROM_LOCAL_PATH = 'local'
    const fullFromPath = isFromRemote ? DOCS_FROM_REMOTE_PATH : DOCS_FROM_LOCAL_PATH
    if (!docsFolder) {
        throw Error('docsPath not set')
    }
    return join(docsFolder, basename(project), fullFromPath)
}

const parseFilename = (filename: string): { projectPath: string, normalizedFilename: string, remoteSeq: string, filenameModDate: string, filenameId: string, filenameCreator: string, filenameModBy: string } => {
    const projectPath = filename.split(sep).slice(-3, -1).join('/')  // {project}/{local|remote}
    const normalizedFilename = basename(filename) // prevent path traversal
    const filenameWithoutExt = parse(normalizedFilename).name
    const [remoteSeq, filenameModDate, filenameId, filenameCreator, filenameModBy] = filenameWithoutExt.split('__')
    return { projectPath, normalizedFilename, remoteSeq, filenameModDate, filenameId, filenameCreator, filenameModBy }
}

type IDBObject = { _id: string, modDate: string, creator: string, modBy?: string }

export const handleStoreDocV0 = async (docsFolder: string, { clientId, project, doc, remoteSeq }: StoreDocArgs<IDBObject>):
    Promise<StoreDocResponse> => {
    if (remoteSeq > 999999999) {
        throw Error(`remoteSeq is too large: ${remoteSeq}`)
    }
    const isFromRemote = !!remoteSeq
    const isLocalDoc = !isFromRemote
    const fullFromPath = buildDocFolder(docsFolder, project, isFromRemote)
    const { _id, modDate, creator, modBy } = doc as { _id: string, modDate: string, creator: string, modBy: string }
    if (!_id || !modDate) {
        throw Error(`_id and modDate properties are required in doc: ${JSON.stringify(doc)}`)
    }
    if (isLocalDoc && !modBy) {
        throw Error(`modBy property is required in local doc: ${JSON.stringify(doc)}`)
    }
    const filename = composeFilename(modDate, _id, creator, modBy, remoteSeq)
    if (filename.length > 255) {
        throw Error(`attempted filename is too long: ${filename}`)
    }
    await ensureDir(fullFromPath)
    let finalFilename = filename
    if (!remoteSeq) {
        // see if _id has already been stored locally with a later modDate
        // if so, add `-lost` to the filename
        // TODO: cache listDocs and maintain it in memory
        try {
            const localFilenames = await listDocs(docsFolder, {
                project, isFromRemote: false,
                fnFilter: (storedFilename) => storedFilename.split('__')[2] === filename.split('__')[2]
            })
            if (localFilenames.includes(filename)) {
                // filename already exists locally, so don't overwrite it
                return { ...parseFilename(filename), freshlyWritten: false }
            }
            // sort localFilenames and get modDate from last one
            const mostRecentLocalFilename = [...localFilenames, filename].sort().pop()
            if (mostRecentLocalFilename !== filename) {
                const lostFilename = `${filename}-lost`
                finalFilename = lostFilename
            }
            const fullPath = join(fullFromPath, finalFilename)
            return await writeDoc(fullPath, doc)
        } catch (error) {
            console.error('An error occurred:', error.message)
        }
    }
    const fullPath = join(fullFromPath, finalFilename)
    const response = writeDoc(fullPath, doc)
    if (remoteSeq) {  //Is from remote is true
        // see if a corresponding local-doc file exists
        const localFolder = buildDocFolder(docsFolder, project, false)
        const localFilename = composeFilename(modDate, _id, creator, modBy, Number.NaN)
        const localPath = join(localFolder, localFilename)
        try {
            // Check if the file exists in the local folder
            // await fs.access(localPath)
            // When the file exists, delete it
            await unlink(localPath)
            console.log(`Successfully deleted local file: ${localPath}`)
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(`Local file does not exist: ${localPath}`)
            } else {
                console.error(`Failed to delete local file: ${localPath}`, error)
            }
        }
    }
    return response
}

export const handleSyncRemoteDocs = async (
    docsFolder: string, { clientId, project, seqDocs }: SyncRemoteDocsArgs<IDBObject>)
    : Promise<SyncDocsResponse<IDBObject>> => {
    
    const fullFromPath = buildDocFolder(docsFolder, project, true)
    await ensureDir(fullFromPath)
    
    const remoteSeqDocsFile = join(fullFromPath, `remote.sltt-docs`)
    // read the last `000000000` characters from the file to get the last remoteSeq
    let nextRemoteSeq = 0
    try {
        const lastBytes = await readLastBytes(remoteSeqDocsFile, 9)
        nextRemoteSeq = Number(lastBytes.toString())
    } catch (error) {
        if (error.code === 'ENOENT') {
            // file doesn't exist, so it's the first sync
            console.log(`Remote file does not exist: ${remoteSeqDocsFile}`)
        } else {
            console.error(`Failed to read remote file: ${remoteSeqDocsFile}`, error)
        }
    }
    if (nextRemoteSeq === 0) {
        // append first nextRemoteSeq to the file
        await appendFile(remoteSeqDocsFile, '000000001')
        nextRemoteSeq = 1
    }
    // if any incoming seqDocs hava a remoteSeq greater or equal to nextRemoteSeq,
    // append them to the end of the file
    const newLines: string[] = []
    const sortedSeqDocs = sortBy(seqDocs, seqDoc => seqDoc.seq)
    for (const { doc, seq } of sortedSeqDocs) {
        if (seq >= nextRemoteSeq) {
            const newLine = `\t${Date.now()}\t${clientId}\t` + JSON.stringify(doc) + `\n${seq + 1}`
            newLines.push(newLine)
        }
    }
    if (newLines.length) {
        await appendFile(remoteSeqDocsFile, newLines.join(''))
    }
}

export const handleSyncLocalDocs = async (
    docsFolder: string, { clientId, project, docs, isRemote }: SyncDocsArgs<IDBObject>)
    : Promise<SyncDocsResponse<IDBObject>> => {
    
    const fullFromPath = buildDocFolder(docsFolder, project, isRemote)
    await ensureDir(fullFromPath)
}

const storeDocV1 = async (docsFolder: string, { clientId, project, doc, remoteSeq }: StoreDocArgs<IDBObject>): Promise<string> => {
    if (remoteSeq > 999999999) {
        throw Error(`remoteSeq is too large: ${remoteSeq}`)
    }
    const isFromRemote = !!remoteSeq
    const isLocalDoc = !isFromRemote
    const fullFromPath = buildDocFolder(docsFolder, project, isFromRemote)
    const { _id, modDate, modBy } = doc as { _id: string, modDate: string, creator: string, modBy: string }
    if (!_id || !modDate) {
        throw Error(`_id and modDate properties are required in doc: ${JSON.stringify(doc)}`)
    }
    if (isLocalDoc && !modBy) {
        throw Error(`modBy property is required in local doc: ${JSON.stringify(doc)}`)
    }
    const clientDocsPath = join(docsFolder, `${clientId}.sltt-docs`)
    try {
        await ensureFile(clientDocsPath)
        const status = isLocalDoc ? `  ` : '' // placeholder first character could be used for removing local docs that are in the remote list 
        // add terse utc timestamp (miliseconds after 2024-09-01) to each line
        // this will allow for sorting by time of creation
        const newLine = `${status}\t${Date.now()}\t` + JSON.stringify(doc) + '\n'
        await appendFile(fullFromPath, newLine)
        return newLine
    } catch (error) {
        console.error('An error occurred:', error.message)
        throw error
    }
}

export const handleListDocsV0 = async (docsFolder: string, { clientId, project, isFromRemote }: ListDocsArgs): Promise<ListDocsResponse> => {
    try {
        const filenames = await listDocs(docsFolder, { project, isFromRemote })
        if (!isFromRemote) {
            const localFilenames: string[] = []
            const remoteFilenames = await listDocs(docsFolder, { project, isFromRemote: true })
            const strippedRemoteFilenames = new Set(remoteFilenames.map((filename) => filename.slice(9) /* strip 9 char remote seq */))
            // TODO: allow for mixed modDates
            // use set subtraction remote filenames from local filenames
            for (const filename of filenames) {
                if (filename.endsWith('-lost.sltt-doc')) {
                    continue
                }
                const strippedFilename = filename.slice(9) /* strip 9 char local-doc */
                if (!strippedRemoteFilenames.has(strippedFilename)) {
                    localFilenames.push(filename)
                }
            }
            return localFilenames
        } else {
            return filenames
        }
    } catch (error) {
        console.error('An error occurred:', error.message)
        throw error
    }
}

export const handleRetrieveDocV0 = async (docsFolder: string, { clientId, project, isFromRemote, filename }: RetrieveDocArgs):
    Promise<RetrieveDocResponse<IDBObject> | null> => {
    const { normalizedFilename, remoteSeq, filenameModDate, filenameId, filenameCreator, filenameModBy } = parseFilename(filename)
    const fullFromPath = buildDocFolder(docsFolder, project, isFromRemote)
    const fullPath = join(fullFromPath, normalizedFilename)
    const { projectPath } = parseFilename(fullPath)
    try {
        const buffer = await readFile(fullPath)
        const doc = JSON.parse(buffer.toString())
        return { projectPath, remoteSeq, normalizedFilename, doc, fullPath, filenameId, filenameModDate, filenameCreator, filenameModBy }
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null
        } else {
            console.error('An error occurred:', error.message)
            throw error
        }
    }
}

async function writeDoc(fullPath: string, doc: unknown):
    Promise<StoreDocResponse> {
    try {
        await writeFile(fullPath, JSON.stringify(doc))
        return { ...parseFilename(fullPath), freshlyWritten: true }
    } catch (error) {
        console.error('An error occurred:', error.message)
        throw error
    }
}

async function listDocs(docsFolder: string, { project, isFromRemote, fnFilter }: { project: string, isFromRemote: boolean, fnFilter?: (string) => boolean }): Promise<string[]> {
    const fullFromPath = buildDocFolder(docsFolder, project, isFromRemote)
    // detect if path doesn't yet exist
    if (!existsSync(fullFromPath)) {
        return []
    }
    console.log('listDocs fullFromPath:', fullFromPath)
    try {
        const filenames = await readdir(fullFromPath)
        console.log('filenames:', filenames)
        const result = filenames
            .filter(filename => filename.endsWith('.sltt-doc') && (!fnFilter || fnFilter(filename)))
        result.sort() // just in case it's not yet by name
        console.log('listDocs result:', result)
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
