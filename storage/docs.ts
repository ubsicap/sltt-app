import { basename, join } from 'path'
import { Stats } from 'fs'
import { readdir, appendFile, stat } from 'fs/promises'
import { ensureDir, ensureFile, writeJson } from 'fs-extra'
import { sortBy, uniqBy } from 'lodash'
import { RetrieveRemoteDocsArgs, RetrieveRemoteDocsResponse, GetRemoteSpotsResponse, SaveRemoteSpotsArgs, StoreRemoteDocsArgs, StoreRemoteDocsResponse, RetrieveLocalClientDocsResponse, RetrieveLocalClientDocsArgs, SaveLocalSpotsArgs, GetLocalSpotsArgs, GetLocalSpotsResponse, GetRemoteSpotsArgs, LocalDoc, StoreLocalDocsArgs, StoreLocalDocsResponse, GetStoredLocalClientIdsResponse, GetStoredLocalClientIdsArgs, LocalSpot } from './docs.d'
import { readJsonCatchMissing, readLastBytes, readFromBytePosition } from './utils'

// import { createHash } from 'crypto'
// const createMd5Hash = (s: string): string => createHash('md5').update(s).digest('hex').toString()
// const createEmailHash = (email: string): string => createMd5Hash(email).substring(0, 16) // api uses this

const buildDocFolder = (docsFolder: string, project: string, isFromRemote: boolean): string => {
    const DOCS_FROM_REMOTE_PATH = 'remote'
    const DOCS_FROM_LOCAL_PATH = 'local'
    const fullFromPath = isFromRemote ? DOCS_FROM_REMOTE_PATH : DOCS_FROM_LOCAL_PATH
    if (!docsFolder) {
        throw Error('docsPath not set')
    }
    return join(docsFolder, basename(project), fullFromPath)
}

export type IDBModDoc = { _id: string, modDate: string, creator: string, modBy?: string }

const MAX_REMOTE_SEQ = 999999999

export const handleStoreRemoteDocs = async (
    docsFolder: string, { clientId, project, seqDocs }: StoreRemoteDocsArgs<IDBModDoc>)
    : Promise<StoreRemoteDocsResponse> => {

    if (seqDocs.length === 0) {
        return { lastSeq: -1, storedCount: 0 }
    }

    const seqDocOutOfRange = seqDocs.find(seqDoc => seqDoc.seq > MAX_REMOTE_SEQ)
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
        const { buffer: lastBytes, fileStats } = await readLastBytes(remoteSeqDocsFile, `${MAX_REMOTE_SEQ}`.length)
        originalFileStats = fileStats
        if (originalFileStats.size > 0 && lastBytes.length) {
            lastStoredSeq = Number(lastBytes.toString())
        }
        if (Number.isNaN(lastStoredSeq)) {
            throw Error(`lastBytes is NaN: ${lastBytes}`)
        }
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
            const paddedSeq = `${seq}`.padStart(`${MAX_REMOTE_SEQ}`.length, '0')
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
    { clientId, project, spot }: RetrieveRemoteDocsArgs): Promise<RetrieveRemoteDocsResponse<IDBModDoc>> => {
        console.log('handleRetrieveRemoteDocs:', { clientId, project, spot })
        const bytesPosition = spot?.bytePosition || 0
        const lastSeq = spot?.seq || -1
        const lastModDate = spot?.modDate || ''
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
        const newModDate = seqDocs.length ? seqDocs[seqDocs.length - 1].doc.modDate : lastModDate
        return { seqDocs, spot: { seq: newLastSeq, bytePosition: fileStats.size, modDate: newModDate }}
}

export const handleSaveRemoteSpots = async (
    docsFolder: string,
    { clientId, project, spots }: SaveRemoteSpotsArgs): Promise<void> => {
    
    const fullFromPath = buildDocFolder(docsFolder, project, true)
    const spotsFile = join(fullFromPath, `${clientId}.sltt-spots`)
    await ensureDir(fullFromPath)
    await writeJson(spotsFile, spots)
}

export const handleGetRemoteSpots = async (
    docsFolder: string,
    { clientId, project }: GetRemoteSpotsArgs): Promise<GetRemoteSpotsResponse> => {
    const fullFromPath = buildDocFolder(docsFolder, project, true)
    const spotsFile = join(fullFromPath, `${clientId}.sltt-spots`)
    return readJsonCatchMissing<GetRemoteSpotsResponse, Record<string, never>>(spotsFile, {})
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
    const clientDocsPath = join(fullFromPath, `${clientId}.sltt-docs`)
    await ensureFile(clientDocsPath)

    let counts = 0
    for (const doc of docs) {
        try {
            const status = EMPTY_STATUS // placeholder first character could be used for filtering local docs that are in the remote list 
            // this will allow for sorting by time of creation
            const newLine = `${status}\t${Date.now()}\t${JSON.stringify(doc)}\n`
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
export const handleRetrieveLocalClientDocs = async (
    docsFolder: string, { clientId, localClientId, project, spot }: RetrieveLocalClientDocsArgs
): Promise<RetrieveLocalClientDocsResponse<IDBModDoc>> => {
    console.log('handleRetrieveLocalClientDocs:', { clientId, localClientId, project, spot })

    // get a directory listing of all the {clientId}.sltt-docs files
    const fullFromPath = buildDocFolder(docsFolder, project, false)
    await ensureDir(fullFromPath)
    const clientBytePosition = spot ? spot.bytePosition : 0

    // now read the files from the last spot byte positions
    const localDocs: LocalDoc<IDBModDoc>[] = []
    const clientDocFile = join(fullFromPath, `${localClientId}.sltt-docs`)
    const { buffer, fileStats } = await readFromBytePosition(clientDocFile, clientBytePosition)
    const clientDocLines = buffer.toString().split('\n').filter(line => line.length > 0)
    const clientLocalDocs = clientDocLines.map((line) => {
        const [status, /* timestamp */, docStr] = line.split('\t')
        return { status, doc: JSON.parse(docStr) }
    }).filter(localDoc => localDoc.status === EMPTY_STATUS).map(
        localDoc => ({ clientId: localClientId, doc: localDoc.doc })
    )
    localDocs.push(...clientLocalDocs)
    const sortedLocalDocs = sortBy(localDocs, localDoc => localDoc.doc.modDate)
    const lastModDate = sortedLocalDocs.slice(-1)[0]?.doc.modDate || spot?.modDate || ''
    const newSpot: LocalSpot = { clientId: localClientId, bytePosition: fileStats.size, modDate: lastModDate }
    return { localDocs: sortedLocalDocs, spot: newSpot }
}

export const handleSaveLocalSpots = async (
    docsFolder: string,
    { clientId, project, spots }: SaveLocalSpotsArgs): Promise<void> => {
    
    const fullFromPath = buildDocFolder(docsFolder, project, false)
    const spotsFile = join(fullFromPath, `${clientId}.sltt-spots`)
    await ensureDir(fullFromPath)
    await writeJson(spotsFile, spots)
}

export const handleGetLocalSpots = async (
    docsFolder: string,
    { clientId, project }: GetLocalSpotsArgs): Promise<GetLocalSpotsResponse> => {
    const fullFromPath = buildDocFolder(docsFolder, project, false)
    const spotsFile = join(fullFromPath, `${clientId}.sltt-spots`)
    return readJsonCatchMissing<GetLocalSpotsResponse, Record<string, never>>(spotsFile, {})
}
