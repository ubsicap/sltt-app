import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import multer from 'multer'
import { join } from 'path'
import { tmpdir } from 'os'
import { getLANStoragePath, getServerConfig, serverState, setLANStoragePath, setProxyUrl } from './serverState'
import { handleGetLocalSpots, handleGetRemoteSpots, handleGetStoredLocalClientIds, handleRetrieveLocalClientDocs, handleRetrieveRemoteDocs, handleSaveLocalSpots, handleSaveRemoteSpots, handleStoreLocalDocs, handleStoreRemoteDocs, IDBModDoc } from './docs'
import { buildLANStoragePath } from './core'
import { listVcrFiles, retrieveVcrs, storeVcr } from './vcrs'
import { AddStorageProjectArgs, CONNECTIONS_API_ADD_STORAGE_PROJECT, CONNECTIONS_API_CONNECT_TO_URL, CONNECTIONS_API_GET_STORAGE_PROJECTS, CONNECTIONS_API_PROBE, CONNECTIONS_API_REMOVE_STORAGE_PROJECT, CONNECTIONS_API_SET_LAN_STORAGE_PATH, ConnectToUrlArgs, GetStorageProjectsArgs, ProbeConnectionsArgs, RemoveStorageProjectArgs, SetLanStoragePathArgs } from './connections.d'
import { handleAddStorageProject, handleConnectToUrl, handleGetStorageProjects, handleProbeConnections, handleRemoveStorageProject } from './connections'
import { BLOBS_API_RETRIEVE_ALL_BLOB_IDS, BLOBS_API_RETRIEVE_BLOB, BLOBS_API_STORE_BLOB, RetrieveBlobArgs, StoreBlobArgs } from './blobs.d'
import { handleRetrieveAllBlobIds, handleRetrieveBlob, handleStoreBlob } from './blobs'
import { handleRegisterClientUser } from './clients'
import { DOCS_API_GET_LOCAL_SPOTS, DOCS_API_GET_REMOTE_SPOTS, DOCS_API_GET_STORED_LOCAL_CLIENT_IDS, DOCS_API_RETRIEVE_LOCAL_CLIENT_DOCS, DOCS_API_RETRIEVE_REMOTE_DOCS, DOCS_API_SAVE_LOCAL_SPOTS, DOCS_API_SAVE_REMOTE_SPOTS, DOCS_API_STORE_LOCAL_DOCS, DOCS_API_STORE_REMOTE_DOCS, GetStoredLocalClientIdsArgs, RetrieveRemoteDocsArgs, SaveRemoteSpotsArgs, StoreRemoteDocsArgs } from './docs.d'
import { CLIENTS_API_REGISTER_CLIENT_USER } from './clients.d'
import { VIDEO_CACHE_RECORDS_API_STORE_VCR, VIDEO_CACHE_RECORDS_API_LIST_VCR_FILES, VIDEO_CACHE_RECORDS_API_RETRIEVE_VCRS } from './vcrs.d'
import { broadcastPushHostDataMaybe } from './udp'
import { app as electronApp } from 'electron' // TODO: remove this dependency on electron??
import { fileURLToPath } from 'url'

const app = express()
const serverConfig = getServerConfig()
const PORT = Number(process.env.PORT) || serverConfig.port

const multiUpload = multer({ dest: `${tmpdir}/sltt-app/server-${PORT}/multiUpload` })

console.log('Starting UDP client on port', PORT)

app.use(cors())
app.use(bodyParser.json({ limit: '500mb' })) // blobs can be 256MB
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }))

const DEFAULT_STORAGE_BASE_PATH = electronApp.getPath('userData')
// setLANStoragePath(buildLANStoragePath(DEFAULT_STORAGE_BASE_PATH))

const getBlobsPath = (): string => join(getLANStoragePath(), 'blobs')
const getVcrsPath = (): string => join(getLANStoragePath(), 'vcrs')
const getDocsPath = (): string => join(getLANStoragePath(), 'docs')
const getClientsPath = (): string => join(getLANStoragePath(), 'clients')

app.get('/status', (req, res) => {
    res.json({ status: 'ok' })
})

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        fn(req, res, next).catch((error: unknown) => {
            res.status(400).json({ error: (error as Error).message })
        })
    }
}

function verifyLocalhost(req: express.Request, res: express.Response, next: express.NextFunction): void {
    if (req.headers.host === `localhost:${PORT}`) {
        next()
        return
    }
    res.status(403).json({ error: 'Forbidden' })
}

app.post(`/${CONNECTIONS_API_SET_LAN_STORAGE_PATH}`, verifyLocalhost, asyncHandler(async (req, res) => {
    const args: SetLanStoragePathArgs = req.body
    const filePath = fileURLToPath(args.url)
    setLANStoragePath(filePath)
    res.json({ ok: true})
}))

app.post(`/${CONNECTIONS_API_PROBE}`, verifyLocalhost, asyncHandler(async (req, res) => {
    console.log(`probe: serverState.myLanStoragePath - ${serverState.myLanStoragePath}`)
    const args: ProbeConnectionsArgs = req.body
    if (serverState.myLanStoragePath) {
        broadcastPushHostDataMaybe(() => handleGetStorageProjects({ clientId: args.clientId, url: 'ignore' }))
    }
    const result = await handleProbeConnections(buildLANStoragePath(DEFAULT_STORAGE_BASE_PATH), args)
    res.json(result)
}))

app.post(`/${CONNECTIONS_API_CONNECT_TO_URL}`, verifyLocalhost, asyncHandler(async (req, res) => {
    console.log(`connectToUrl: serverState.myLanStoragePath - ${serverState.myLanStoragePath}`)
    const args: ConnectToUrlArgs = req.body
    serverState.myUsername = args.username
    if (args.url.startsWith('http')) {
        setProxyUrl(args.url)
        res.json(args.url) // todo: JSON.stringify host computer name etc...
    } else {
        const newStoragePath = await handleConnectToUrl(args)
        setLANStoragePath(newStoragePath)
        serverState.allowHosting = args.allowHosting
        broadcastPushHostDataMaybe(() => handleGetStorageProjects({ clientId: args.clientId, url: 'ignore' }))
        res.json(newStoragePath)
    }
}))

function verifyLocalhostUnlessHosting(req: express.Request, res: express.Response, next: express.NextFunction): void {
    if (serverState.allowHosting) {
        next()
        return
    }
    verifyLocalhost(req, res, next)
}

app.post(`/${CONNECTIONS_API_GET_STORAGE_PROJECTS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: GetStorageProjectsArgs = req.body
    const result = await handleGetStorageProjects(args)
    res.json(result)
}))

app.post(`/${CONNECTIONS_API_ADD_STORAGE_PROJECT}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: AddStorageProjectArgs = req.body
    await handleAddStorageProject(args)
    res.json({ message: 'Project added successfully' })
}))

app.post(`/${CONNECTIONS_API_REMOVE_STORAGE_PROJECT}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: RemoveStorageProjectArgs = req.body
    await handleRemoveStorageProject(args)
    res.json({ message: 'Project removed successfully' })
}))

app.post(`/${CLIENTS_API_REGISTER_CLIENT_USER}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const { clientId, username } = req.body
    const result = await handleRegisterClientUser(getClientsPath(), { clientId, username })
    res.json(result)
}))

app.post(`/${BLOBS_API_RETRIEVE_BLOB}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: RetrieveBlobArgs = req.body
    try {
        const result = await handleRetrieveBlob(getBlobsPath(), args)
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
}))

app.post(`/${BLOBS_API_STORE_BLOB}`, verifyLocalhostUnlessHosting, multiUpload.single('blob'), asyncHandler(async (req, res) => {
    const origArgs: StoreBlobArgs = {
        clientId: req.body['clientId'],
        blobId: req.body['blobId'],
        blob: req.file,
    }
    const args: { blobId: string, file: File } = {
        blobId: origArgs.blobId,
        file: origArgs.blob as File,
    }
    const result = await handleStoreBlob(getBlobsPath(), args)
    res.json(result)
}))

app.post(`/${BLOBS_API_RETRIEVE_ALL_BLOB_IDS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const { clientId } = req.body
    const result = await handleRetrieveAllBlobIds(getBlobsPath(), { clientId })
    res.json(result)
}))

app.post(`/${VIDEO_CACHE_RECORDS_API_STORE_VCR}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const { clientId, videoCacheRecord } = req.body
    const result = await storeVcr(getVcrsPath(), { clientId, videoCacheRecord })
    res.json(result)
}))

app.post(`/${VIDEO_CACHE_RECORDS_API_LIST_VCR_FILES}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const { clientId, project } = req.body
    const result = await listVcrFiles(getVcrsPath(), { clientId, project })
    res.json(result)
}))

app.post(`/${VIDEO_CACHE_RECORDS_API_RETRIEVE_VCRS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const { clientId, filename } = req.body
    const result = await retrieveVcrs(getVcrsPath(), { clientId, filename })
    res.json(result)
}))

app.post(`/${DOCS_API_STORE_REMOTE_DOCS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: StoreRemoteDocsArgs<IDBModDoc> = req.body
    const result = await handleStoreRemoteDocs(getDocsPath(), args)
    res.json(result)
}))

app.post(`/${DOCS_API_RETRIEVE_REMOTE_DOCS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: RetrieveRemoteDocsArgs = req.body
    const result = await handleRetrieveRemoteDocs(getDocsPath(), args)
    res.json(result)
}))

app.post(`/${DOCS_API_SAVE_REMOTE_SPOTS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: SaveRemoteSpotsArgs = req.body
    await handleSaveRemoteSpots(getDocsPath(), args)
    res.json({ message: 'Remote spots saved successfully' })
}))

app.post(`/${DOCS_API_GET_REMOTE_SPOTS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const { clientId, project } = req.body
    const result = await handleGetRemoteSpots(getDocsPath(), { clientId, project })
    res.json(result)
}))

app.post(`/${DOCS_API_STORE_LOCAL_DOCS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const { clientId, project, docs } = req.body
    const result = await handleStoreLocalDocs(getDocsPath(), { clientId, project, docs })
    res.json(result)
}))

app.post(`/${DOCS_API_GET_STORED_LOCAL_CLIENT_IDS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const { project }: GetStoredLocalClientIdsArgs = req.body
    const result = await handleGetStoredLocalClientIds(getDocsPath(), { project })
    res.json(result)
}))

app.post(`/${DOCS_API_RETRIEVE_LOCAL_CLIENT_DOCS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const { clientId, localClientId, project, spot } = req.body
    const result = await handleRetrieveLocalClientDocs(getDocsPath(), { clientId, localClientId, project, spot })
    res.json(result)
}))

app.post(`/${DOCS_API_SAVE_LOCAL_SPOTS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const { clientId, project, spots } = req.body
    await handleSaveLocalSpots(getDocsPath(), { clientId, project, spots })
    res.json({ message: 'Local spots saved successfully' })
}))

app.post(`/${DOCS_API_GET_LOCAL_SPOTS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const { clientId, project } = req.body
    const result = await handleGetLocalSpots(getDocsPath(), { clientId, project })
    res.json(result)
}))

app.listen(PORT, () => {
    console.log(`Storage server is running localhost port ${PORT}`)
})
