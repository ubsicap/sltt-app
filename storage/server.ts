import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import multer from 'multer'
import { join } from 'path'
import { tmpdir } from 'os'
import { getLANStoragePath, getServerConfig, serverState, setLANStoragePath, setProxyUrl } from './serverState'
import { handleGetLocalSpots, handleGetRemoteSpots, handleGetStoredLocalClientIds, handleRetrieveLocalClientDocs, handleRetrieveRemoteDocs, handleSaveLocalSpots, handleSaveRemoteSpots, handleStoreLocalDocs, handleStoreRemoteDocs, IDBModDoc } from './docs'
import { getLANStoragePath as buildLANStoragePath } from './core'
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

const app = express()
const serverConfig = getServerConfig()
const PORT = Number(process.env.PORT) || serverConfig.port

const multiUpload = multer({ dest: `${tmpdir}/sltt-app/server-${PORT}/multiUpload` })

console.log('Starting UDP client on port', PORT)

app.use(cors())
app.use(bodyParser.json({ limit: '500mb' })) // blobs can be 256MB
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }))

const DEFAULT_STORAGE_BASE_PATH = electronApp.getPath('userData')

const getBlobsPath = (): string => join(getLANStoragePath(), 'blobs')
const getVcrsPath = (): string => join(getLANStoragePath(), 'vcrs')
const getDocsPath = (): string => join(getLANStoragePath(), 'docs')
const getClientsPath = (): string => join(getLANStoragePath(), 'clients')

app.get('/status', (req, res) => {
    res.json({ status: 'ok' })
})

function verifyLocalhost(req: express.Request, res: express.Response): void {
    if (req.headers.host === `localhost:${PORT}`) {
        return
    }
    res.status(403).json({ error: 'Forbidden' })
}

app.post(`/${CONNECTIONS_API_SET_LAN_STORAGE_PATH}`, async (req, res) => {
    verifyLocalhost(req, res)
    const args: SetLanStoragePathArgs = req.body
    try {
        setLANStoragePath(args.url)
        res.json({ ok: true})
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post(`/${CONNECTIONS_API_GET_STORAGE_PROJECTS}`, async (req, res) => {
    const args: GetStorageProjectsArgs = req.body
    try {
        const result = await handleGetStorageProjects(args)
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post(`/${CONNECTIONS_API_ADD_STORAGE_PROJECT}`, async (req, res) => {
    const args: AddStorageProjectArgs = req.body
    try {
        await handleAddStorageProject(args)
        res.json({ message: 'Project added successfully' })
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post(`/${CONNECTIONS_API_REMOVE_STORAGE_PROJECT}`, async (req, res) => {
    const args: RemoveStorageProjectArgs = req.body
    try {
        await handleRemoveStorageProject(args)
        res.json({ message: 'Project removed successfully' })
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post(`/${CONNECTIONS_API_PROBE}`, async (req, res) => {
    verifyLocalhost(req, res)
    const lanStoragePath = getLANStoragePath()
    console.log(`probe: lanStoragePath - ${lanStoragePath}`)
    const args: ProbeConnectionsArgs = req.body
    try {
        broadcastPushHostDataMaybe()
        const result = await handleProbeConnections(buildLANStoragePath(DEFAULT_STORAGE_BASE_PATH), args)
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post(`/${CONNECTIONS_API_CONNECT_TO_URL}`, async (req, res) => {
    verifyLocalhost(req, res)
    const lanStoragePath = getLANStoragePath()
    console.log(`connectToUrl: lanStoragePath - ${lanStoragePath}`)
    const args: ConnectToUrlArgs = req.body
    try {
        serverState.myUsername = args.username
        if (args.url.startsWith('http')) {
            setProxyUrl(args.url)
            res.json(args.url) // todo: JSON.stringify host computer name etc...
        } else {
            const newStoragePath = await handleConnectToUrl(args)
            setLANStoragePath(newStoragePath)
            serverState.allowHosting = args.allowHosting
            broadcastPushHostDataMaybe()
            res.json(newStoragePath)
        }
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post(`/${CLIENTS_API_REGISTER_CLIENT_USER}`, async (req, res) => {
    const { clientId, username } = req.body
    try {
        const result = await handleRegisterClientUser(getClientsPath(), { clientId, username })
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post(`/${BLOBS_API_RETRIEVE_BLOB}`, async (req, res) => {
    const args: RetrieveBlobArgs = req.body
    try {
        const result = await handleRetrieveBlob(getBlobsPath(), args)
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post(`/${BLOBS_API_STORE_BLOB}`, multiUpload.single('blob'), async (req, res) => {
    const origArgs: StoreBlobArgs = {
        clientId: req.body['clientId'],
        blobId: req.body['blobId'],
        blob: req.file,
    }
    const args: { blobId: string, file: File } = {
        blobId: origArgs.blobId,
        file: origArgs.blob as File,
    }
    try {
        const result = await handleStoreBlob(getBlobsPath(), args)
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post(`/${BLOBS_API_RETRIEVE_ALL_BLOB_IDS}`, async (req, res) => {
    const { clientId } = req.body
    try {
        const result = await handleRetrieveAllBlobIds(getBlobsPath(), { clientId })
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post(`/${VIDEO_CACHE_RECORDS_API_STORE_VCR}`, async (req, res) => {
    const { clientId, videoCacheRecord } = req.body
    try {
        const result = await storeVcr(getVcrsPath(), { clientId, videoCacheRecord })
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post(`/${VIDEO_CACHE_RECORDS_API_LIST_VCR_FILES}`, async (req, res) => {
    const { clientId, project } = req.body
    try {
        const result = await listVcrFiles(getVcrsPath(), { clientId, project })
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post(`/${VIDEO_CACHE_RECORDS_API_RETRIEVE_VCRS}`, async (req, res) => {
    const { clientId, filename } = req.body
    try {
        const result = await retrieveVcrs(getVcrsPath(), { clientId, filename })
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post(`/${DOCS_API_STORE_REMOTE_DOCS}`, async (req, res) => {
    const args: StoreRemoteDocsArgs<IDBModDoc> = req.body
    try {
        const result = await handleStoreRemoteDocs(getDocsPath(), args)
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post(`/${DOCS_API_RETRIEVE_REMOTE_DOCS}`, async (req, res) => {
    const args: RetrieveRemoteDocsArgs = req.body
    try {
        const result = await handleRetrieveRemoteDocs(getDocsPath(), args)
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post(`/${DOCS_API_SAVE_REMOTE_SPOTS}`, async (req, res) => {
    const args: SaveRemoteSpotsArgs = req.body
    try {
        await handleSaveRemoteSpots(getDocsPath(), args)
        res.json({ message: 'Remote spots saved successfully' })
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post(`/${DOCS_API_GET_REMOTE_SPOTS}`, async (req, res) => {
    const { clientId, project } = req.body
    try {
        const result = await handleGetRemoteSpots(getDocsPath(), { clientId, project })
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post(`/${DOCS_API_STORE_LOCAL_DOCS}`, async (req, res) => {
    const { clientId, project, docs } = req.body
    try {
        const result = await handleStoreLocalDocs(getDocsPath(), { clientId, project, docs })
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post(`/${DOCS_API_GET_STORED_LOCAL_CLIENT_IDS}`, async (req, res) => {
    const { project }: GetStoredLocalClientIdsArgs = req.body
    try {
        const result = await handleGetStoredLocalClientIds(getDocsPath(), { project })
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post(`/${DOCS_API_RETRIEVE_LOCAL_CLIENT_DOCS}`, async (req, res) => {
    const { clientId, localClientId, project, spot } = req.body
    try {
        const result = await handleRetrieveLocalClientDocs(getDocsPath(), { clientId, localClientId, project, spot })
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post(`/${DOCS_API_SAVE_LOCAL_SPOTS}`, async (req, res) => {
    const { clientId, project, spots } = req.body
    try {
        await handleSaveLocalSpots(getDocsPath(), { clientId, project, spots })
        res.json({ message: 'Local spots saved successfully' })
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post(`/${DOCS_API_GET_LOCAL_SPOTS}`, async (req, res) => {
    const { clientId, project } = req.body
    try {
        const result = await handleGetLocalSpots(getDocsPath(), { clientId, project })
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.listen(PORT, () => {
    console.log(`Storage server is running localhost port ${PORT}`)
})
