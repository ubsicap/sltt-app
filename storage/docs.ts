import { createHash } from 'crypto'
import { basename, join, parse, sep } from 'path'
import { existsSync, Stats } from 'fs'
import { readFile, writeFile, readdir, unlink, appendFile, stat } from 'fs/promises'
import { ensureDir, ensureFile, writeJson } from 'fs-extra'
import { sortBy, uniqBy, keyBy } from 'lodash'
import { ListDocsArgs, ListDocsResponse, RetrieveDocArgs, RetrieveDocResponse, RetrieveRemoteDocsArgs, RetrieveRemoteDocsResponse, GetRemoteSpotsResponse, SaveRemoteSpotsArgs, StoreDocArgs, StoreDocResponse, StoreRemoteDocsArgs, StoreRemoteDocsResponse, RetrieveLocalDocsResponse, RetrieveLocalDocsArgs, SaveLocalSpotsArgs, GetLocalSpotsArgs, GetLocalSpotsResponse, GetRemoteSpotsArgs, LocalDoc, StoreLocalDocsArgs, StoreLocalDocsResponse, GetStoredLocalClientIdsResponse, GetStoredLocalClientIdsArgs } from './docs.d'
import { readJsonCatchMissing, readLastBytes, readFromBytePosition } from './utils'



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

export type IDBModDoc = { _id: string, modDate: string, creator: string, modBy?: string }

export const handleStoreDocV0 = async (docsFolder: string, { clientId, project, doc, remoteSeq }: StoreDocArgs<IDBModDoc>):
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

export const handleStoreRemoteDocs = async (
    docsFolder: string, { clientId, project, seqDocs }: StoreRemoteDocsArgs<IDBModDoc>)
    : Promise<StoreRemoteDocsResponse> => {

    if (seqDocs.length === 0) {
        return { lastSeq: -1, storedCount: 0 }
    }

    const seqDocOutOfRange = seqDocs.find(seqDoc => seqDoc.seq > 999999999)
    if (seqDocOutOfRange) {
        throw Error(`remote seq (${seqDocOutOfRange.seq}) too large: ${JSON.stringify(seqDocOutOfRange)}`)
    }

    const fullFromPath = buildDocFolder(docsFolder, project, true)
    await ensureDir(fullFromPath)
    
    const remoteSeqDocsFile = join(fullFromPath, `remote.sltt-docs`)
    // read the last `000000000` characters from the file to get the last stored remoteSeq
    let lastStoredSeq = 0
    let originalFileStats: Stats
    try {
        const { buffer: lastBytes, fileStats } = await readLastBytes(remoteSeqDocsFile, 9)
        originalFileStats = fileStats
        lastStoredSeq = Number(lastBytes.toString())
    } catch (error) {
        if (error.code === 'ENOENT') {
            // file doesn't exist, so it's the first sync
            console.log(`Remote file does not exist: ${remoteSeqDocsFile}`)
        } else {
            console.error(`Failed to read remote file: ${remoteSeqDocsFile}`, error)
        }
    }
    // if any incoming seqDocs hava a seq greater than lastStoredSeq,
    // append them to the end of the file
    const newLines: string[] = []
    const sortedSeqDocs = sortBy(seqDocs, seqDoc => seqDoc.seq)
    const lastSeq = sortedSeqDocs[sortedSeqDocs.length - 1].seq
    for (const { doc, seq } of sortedSeqDocs) {
        if (seq > lastStoredSeq) {
            const paddedSeq = `${seq}`.padStart(9, '0')
            const newLine = `${paddedSeq}\t${Date.now()}\t${clientId}\t` + JSON.stringify(doc) + `\t${paddedSeq}\n`
            newLines.push(newLine)
        }
    }
    let newSize = -1
    try {
        const newFileStats = await stat(remoteSeqDocsFile)
        newSize = newFileStats.size
    } catch (error) {
        if (error.code === 'ENOENT') {
            // file doesn't exist, so it's the first sync
            console.log(`Remote file does not exist: ${remoteSeqDocsFile}`)
        } else {
            throw error
        }
    }
    
    if ((newSize > -1 && originalFileStats) && newSize !== originalFileStats.size) {
        // file has changed since we last read it
        const error = `Since last read remote.sltt-docs changed from size ${originalFileStats.size} to ${newSize}`
        console.log(error)
        // silently ignore the changes for now
        return { lastSeq, storedCount: 0, error }
    }
    if (newLines.length) {
        await appendFile(remoteSeqDocsFile, newLines.join(''))
    }
    return { lastSeq, storedCount: newLines.length }
}

export const handleRetrieveRemoteDocs = async (
    docsFolder: string,
    { clientId, project, spotKey }: RetrieveRemoteDocsArgs): Promise<RetrieveRemoteDocsResponse<IDBModDoc>> => {
        let bytesPosition = 0
        // first retrieve spot from from spotKey (if exists)
        const spots = await retrieveRemoteSpots(docsFolder, { clientId, project })
        const lastSeq = spots[spotKey]?.seq || 0
        if (spotKey && spots[spotKey]) {
            bytesPosition = spots[spotKey].bytePosition
        }
        const fullFromPath = buildDocFolder(docsFolder, project, true)
        const remoteSeqDocsFile = join(fullFromPath, `remote.sltt-docs`)
        const { buffer, fileStats } = await readFromBytePosition(remoteSeqDocsFile, bytesPosition)
        const remoteSeqDocLines = buffer.toString().split('\n').filter(line => line.length > 0)
        // We can't assume that they are in order, unique or even end where we left off (writing race-condition)
        const seqDocsFirstPass = remoteSeqDocLines.map((line) => {
            const [seq, , , docStr] = line.split('\t')
            return { seq: Number(seq), doc: JSON.parse(docStr) }
        }).filter(seqDoc => seqDoc.seq > lastSeq)
        const seqDocs = uniqBy(seqDocsFirstPass, (seqDoc) => seqDoc.seq)
        const newLastSeq = seqDocs.length ? seqDocs[seqDocs.length - 1].seq : lastSeq
        return { seqDocs, spot: ['last', { seq: newLastSeq, bytePosition: fileStats.size }]}
}

export const handleSaveRemoteSpots = async (
    docsFolder: string,
    { clientId, project, spots }: SaveRemoteSpotsArgs): Promise<void> => {
    
    const fullFromPath = buildDocFolder(docsFolder, project, true)
    const spotsFile = join(fullFromPath, `${clientId}.sltt-spots`)
    await writeJson(spotsFile, spots)
}

export const retrieveRemoteSpots = async (
    docsFolder: string,
    { clientId, project }: GetRemoteSpotsArgs): Promise<GetRemoteSpotsResponse> => {
    const fullFromPath = buildDocFolder(docsFolder, project, true)
    const spotsFile = join(fullFromPath, `${clientId}.sltt-spots`)
    return readJsonCatchMissing(spotsFile, {})
}

export const EMPTY_STATUS = '  ' // two spaces


// TODO: keep track of master list of ids and modDates json file
// so we can filter out local docs that are in the remote list
// when to do this?
// 1. when a client stores a remote or local doc, we could use an index to check if the id is in some client local list, and mark its status
// that index could be trimmed to remove those ids that are not in the remote list
// 2. add an api for the client to request to cleanup local docs that are in the remote list
// 3. let the client look through its own remote docs to skip them
// 4. don't bother...
export const handleStoreLocalDocs = async (docsFolder: string, { clientId, project, docs }: StoreLocalDocsArgs<IDBModDoc>): Promise<StoreLocalDocsResponse> => {
    const fullFromPath = buildDocFolder(docsFolder, project, false)

    for (const doc of docs) {
        const { _id, modDate, modBy } = doc as { _id: string, modDate: string, creator: string, modBy: string }
        if (!_id || !modDate) {
            throw Error(`_id and modDate properties are required in doc: ${JSON.stringify(doc)}`)
        }
        if (!modBy) {
            throw Error(`modBy property is required in local doc: ${JSON.stringify(doc)}`)
        }
    }
    await ensureDir(fullFromPath)
    const clientDocsPath = join(docsFolder, `${clientId}.sltt-docs`)
    await ensureFile(clientDocsPath)

    let counts = 0
    for (const doc of docs) {
        const { modBy } = doc as IDBModDoc
        try {
            const status = EMPTY_STATUS // placeholder first character could be used for filtering local docs that are in the remote list 
            // this will allow for sorting by time of creation
            const newLine = `${status}\t${Date.now()}\t${modBy}\t${JSON.stringify(doc)}\n`
            await appendFile(clientDocsPath, newLine)
            counts++
        } catch (error) {
            console.error('An error occurred:', error.message)
            throw error
        }
    }
    return { storedCount: counts }
}

export const handleGetStoredLocalClientIds = async (
    docsFolder: string, { project }: GetStoredLocalClientIdsArgs): Promise<GetStoredLocalClientIdsResponse> => {
    const fullFromPath = buildDocFolder(docsFolder, project, false)
    await ensureDir(fullFromPath)
    // all files in the directory
    const filenames = await readdir(fullFromPath)
    // filter out the ones that are not .sltt-docs files
    const allClientDocFiles = filenames.filter(filename => filename.endsWith(`.sltt-docs`))
    // get the clientIds from the filenames
    const allStoredClientIds = allClientDocFiles.map(filename => filename.split('.')[0])
    return allStoredClientIds
}

// might need to break this api so client can request per clientId
// that means we'd need a way to list the clients
export const handleRetrieveLocalDocs = async (
    docsFolder: string, { clientId, project, spotKey, includeOwn }: RetrieveLocalDocsArgs
): Promise<RetrieveLocalDocsResponse<IDBModDoc>> => {

    // get a directory listing of all the {clientId}.sltt-docs files
    const fullFromPath = buildDocFolder(docsFolder, project, false)
    await ensureDir(fullFromPath)
    // all files in the directory
    const filenames = await readdir(fullFromPath)
    // filter out the ones that are not .sltt-docs files
    const allClientDocFiles = filenames.filter(filename => filename.endsWith(`.sltt-docs`))
    // get the clientIds from the filenames
    const allStoredClientIds = allClientDocFiles.map(filename => filename.split('.')[0])
    // get the last spots for these clientIds
    const spots = await retrieveLocalSpots(docsFolder, { clientId, project })
    // map the clientIds to starting byte positions (default to 0)
    const clientBytePositions = {}
    const lastSpotsByClientId = keyBy(spots[spotKey] || [], spot => spot.clientId)
    for (const storedClientId of allStoredClientIds) {
        if (!includeOwn && storedClientId === clientId) continue
        const spot = lastSpotsByClientId[storedClientId]
        const clientBytePosition = spot ? spot.bytePosition : 0
        clientBytePositions[storedClientId] = clientBytePosition
    }
    // now read the files from the last spot byte positions
    const localDocs: LocalDoc<IDBModDoc>[] = []
    const newSpots = []
    for (const storedClientId of allStoredClientIds) {
        if (!includeOwn && storedClientId === clientId) continue
        const clientDocFile = join(fullFromPath, `${storedClientId}.sltt-docs`)
        const bytesPosition = clientBytePositions[storedClientId]
        const { buffer, fileStats } = await readFromBytePosition(clientDocFile, bytesPosition)
        const clientDocLines = buffer.toString().split('\n').filter(line => line.length > 0)
        const clientLocalDocs = clientDocLines.map((line) => {
            const [status, , , docStr] = line.split('\t')
            return { status, doc: JSON.parse(docStr) }
        }).filter(localDoc => localDoc.status === EMPTY_STATUS).map(
            localDoc => ({ clientId: storedClientId, doc: localDoc.doc })
        )
        localDocs.push(...clientLocalDocs)
        const newSpot = { clientId: storedClientId, bytePosition: fileStats.size }
        newSpots.push(newSpot)
    }
    const sortedLocalDocs = sortBy(localDocs, localDoc => localDoc.doc.modDate)
    return { localDocs: sortedLocalDocs, spot: ['last', newSpots] }
}

export const handleSaveLocalSpots = async (
    docsFolder: string,
    { clientId, project, spots }: SaveLocalSpotsArgs): Promise<void> => {
    
    const fullFromPath = buildDocFolder(docsFolder, project, false)
    const spotsFile = join(fullFromPath, `${clientId}.sltt-spots`)
    await writeJson(spotsFile, spots)
}

export const retrieveLocalSpots = async (
    docsFolder: string,
    { clientId, project }: GetLocalSpotsArgs): Promise<GetLocalSpotsResponse> => {
    const fullFromPath = buildDocFolder(docsFolder, project, false)
    const spotsFile = join(fullFromPath, `${clientId}.sltt-spots`)
    return readJsonCatchMissing(spotsFile, {})
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
    Promise<RetrieveDocResponse<IDBModDoc> | null> => {
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
