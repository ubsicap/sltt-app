import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import multer from 'multer'
import { join } from 'path'
import { hostname, tmpdir } from 'os'
import { createUrl, getAmHosting, getLANStoragePath, serverState, setLANStoragePath, setProxy } from './serverState'
import { handleGetLocalSpots, handleGetRemoteSpots, handleGetStoredLocalClientIds, handleRetrieveLocalClientDocs, handleRetrieveRemoteDocs, handleSaveLocalSpots, handleSaveRemoteSpots, handleStoreLocalDocs, handleStoreRemoteDocs, IDBModDoc } from './docs'
import { AddStorageProjectArgs, CONNECTIONS_API_ADD_STORAGE_PROJECT, CONNECTIONS_API_CONNECT, CONNECTIONS_API_GET_STORAGE_PROJECTS, CONNECTIONS_API_PROBE, CONNECTIONS_API_REMOVE_STORAGE_PROJECT, ConnectArgs, ConnectResponse, GetStorageProjectsArgs, ProbeConnectionsArgs, RemoveStorageProjectArgs, CONNECTIONS_API_START_UDP, StartUdpResponse, RemoveStorageProjectResponse, AddStorageProjectResponse, ProbeConnectionsResponse, GetStorageProjectsResponse } from './connections.d'
import { handleAddStorageProject, handleConnectToUrl, handleGetStorageProjects, handleProbeConnections, handleRemoveStorageProject } from './connections'
import { BLOBS_API_RETRIEVE_ALL_BLOB_IDS, BLOBS_API_RETRIEVE_BLOB, BLOBS_API_RETRIEVE_BLOB_INFO, BLOBS_API_STORE_BLOB, BLOBS_API_UPDATE_BLOB_UPLOADED_STATUS, RetrieveAllBlobIdsArgs, RetrieveAllBlobIdsResponse, RetrieveBlobArgs, RetrieveBlobInfoArgs, RetrieveBlobInfoResponse, RetrieveBlobResponse, StoreBlobArgs, StoreBlobResponse, UpdateBlobUploadedStatusArgs, UpdateBlobUploadedStatusResponse } from './blobs.d'
import { cleanupUploadQueueFolder, handleRetrieveAllBlobIds, handleRetrieveBlob, handleRetrieveBlobInfo, handleStoreBlob, HandleStoreBlobArgs, handleUpdateBlobUploadedStatus } from './blobs'
import { handleRegisterClientUser } from './clients'
import { DOCS_API_GET_LOCAL_SPOTS, DOCS_API_GET_REMOTE_SPOTS, DOCS_API_GET_STORED_LOCAL_CLIENT_IDS, DOCS_API_RETRIEVE_LOCAL_CLIENT_DOCS, DOCS_API_RETRIEVE_REMOTE_DOCS, DOCS_API_SAVE_LOCAL_SPOTS, DOCS_API_SAVE_REMOTE_SPOTS, DOCS_API_STORE_LOCAL_DOCS, DOCS_API_STORE_REMOTE_DOCS, GetLocalSpotsArgs, GetLocalSpotsResponse, GetRemoteSpotsArgs, GetRemoteSpotsResponse, GetStoredLocalClientIdsArgs, GetStoredLocalClientIdsResponse, RetrieveLocalClientDocsArgs, RetrieveLocalClientDocsResponse, RetrieveRemoteDocsArgs, RetrieveRemoteDocsResponse, SaveLocalSpotsArgs, SaveLocalSpotsResponse, SaveRemoteSpotsArgs, SaveRemoteSpotsResponse, StoreLocalDocsArgs, StoreLocalDocsResponse, StoreRemoteDocsArgs, StoreRemoteDocsResponse } from './docs.d'
import { CLIENTS_API_REGISTER_CLIENT_USER, RegisterClientUserArgs, RegisterClientUserResponse } from './clients.d'
import { startUdpClient, broadcastPushHostDataMaybe, startHostExpirationTimer, startPushHostDataUpdating } from './udp'
import { saveServerSettings, loadServerSettings, getServerConfig, MY_CLIENT_ID } from './serverConfig'
import { canWriteToFolder, loadHostFolder, saveHostFolder } from './hostFolder'
import { CanWriteToFolderArgs, HOST_FOLDER_API_SET_ALLOW_HOSTING, HOST_FOLDER_API_CAN_WRITE_TO_FOLDER, HOST_FOLDER_API_LOAD_HOST_FOLDER, HOST_FOLDER_API_SAVE_HOST_FOLDER, SaveHostFolderArgs, SaveHostFolderResponse, SetAllowHostingArgs, SetAllowHostingResponse, HOST_FOLDER_API_GET_ALLOW_HOSTING, GetAllowHostingResponse, CanWriteToFolderResponse, LoadHostFolderResponse } from './hostFolder.d'
import { reportToRollbar } from '../services/rollbar'
import { stringify as safeStableStringify } from 'safe-stable-stringify'

let udpState: ReturnType<typeof startUdpClient> | undefined = undefined

const startAllUdpMessaging = () => {
    udpState = startUdpClient()
    startHostExpirationTimer()
    startPushHostDataUpdating(() => handleGetStorageProjects({ clientId: MY_CLIENT_ID }))
}

let configSettingsPath: string

const app = express()
const serverConfig = getServerConfig()
const PORT = Number(process.env.PORT) || serverConfig.port

const multiUpload = multer({ dest: `${tmpdir}/sltt-app/server-${PORT}/multiUpload` })

console.log('storage server port: ', PORT)

const debug = true

// Log request/response
debug && app.use((req, res, next) => {
    res.on('finish', () => {
        logRequest(req)
    })
    next()
})

function logRequest(req: express.Request): void {
    const clientId = req.body?.clientId
    if (req.method === 'OPTIONS' && !clientId) return
    console.log(`req [${req.ip} ${clientId ?? 'xxxx'}] (${req.headers.host}) ${req.method} ${req.originalUrl}`)
}

app.use(cors())
app.use(bodyParser.json({ limit: '500mb' })) // blobs can be 256MB
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }))

const getBlobsPath = (): string => join(getLANStoragePath(), 'blobs')
const getDocsPath = (): string => join(getLANStoragePath(), 'docs')
const getClientsPath = (): string => join(getLANStoragePath(), 'clients')

app.get('/status', (_, res) => {
    res.json({ status: 'ok' })
})

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        fn(req, res, next).catch((error: unknown) => {
            const errMessage = (error as Error).message
            console.error('asyncHandler error:', errMessage)
            const clientId = req.body?.clientId
            reportToRollbar({ error: error as Error, custom: {
                context: 'storage/server: asyncHandler',
                serverState,
                serverConfig,
                udpState,
                clientId,
                req: {
                    ip: req.ip,
                    method: req.method,
                    originalUrl: req.originalUrl,
                    isFile: req.file ? true : false,
                    body: safeStableStringify(req.body),
                    headers: safeStableStringify(req.headers),
                },
            } })
            res.status(400).json({ error: errMessage })
            return
        })
    }
}

function verifyLocalhost(req: express.Request, res: express.Response, next: express.NextFunction): void {
    if (req.headers.host === `localhost:${PORT}`) {
        next()
        return
    }
    console.error(`Forbidden: ${req.headers.host} from ${req.ip}`)
    res.status(403).json({ error: 'Forbidden' })
}

app.post(`/${CONNECTIONS_API_START_UDP}`, verifyLocalhost, asyncHandler(async (_, res) => {
    startAllUdpMessaging()
    const response: StartUdpResponse = { ok: true }
    res.json(response)
}))

app.post(`/${HOST_FOLDER_API_LOAD_HOST_FOLDER}`, verifyLocalhost, asyncHandler(async (_, res) => {
    const response: LoadHostFolderResponse = await loadHostFolder()
    res.json(response)
}))

app.post(`/${HOST_FOLDER_API_SAVE_HOST_FOLDER}`, verifyLocalhost, asyncHandler(async (req, res) => {
    const args: SaveHostFolderArgs = req.body
    const response: SaveHostFolderResponse = await saveHostFolder(args.hostFolder)
    setLANStoragePath(args.hostFolder)
    await saveServerSettings(configSettingsPath, serverState)
    broadcastPushHostDataMaybe(() => handleGetStorageProjects({ clientId: args.clientId }))
    res.json(response)
}))

app.post(`/${HOST_FOLDER_API_CAN_WRITE_TO_FOLDER}`, verifyLocalhost, asyncHandler(async (req, res) => {
    const args: CanWriteToFolderArgs = req.body
    const response: CanWriteToFolderResponse = await canWriteToFolder(args.folderPath)
    if (response.errorCode) {
        console.warn(`canWriteToFolder error: ${response.errorCode} - ${response.errorInfo}`)
    }
    res.json(response)
}))

app.post(`/${HOST_FOLDER_API_GET_ALLOW_HOSTING}`, verifyLocalhost, asyncHandler(async (_, res) => {
    const response: GetAllowHostingResponse = { allowHosting: serverState.allowHosting }
    res.json(response)
}))

app.post(`/${HOST_FOLDER_API_SET_ALLOW_HOSTING}`, verifyLocalhost, asyncHandler(async (req, res) => {
    const args: SetAllowHostingArgs = req.body
    serverState.allowHosting = args.allowHosting
    await saveServerSettings(configSettingsPath, {
        myServerId: serverState.myServerId,
        allowHosting: args.allowHosting,
        myLanStoragePath: serverState.myLanStoragePath,
    })
    if (getAmHosting()) {
        startAllUdpMessaging()
        broadcastPushHostDataMaybe(() => handleGetStorageProjects({ clientId: args.clientId }))
    } else {
        // remove from my hosts. (Other computers will take 10 seconds to expire me)
        delete serverState.hosts[serverState.myServerId]
    }
    const response: SetAllowHostingResponse = { ok: true }
    res.json(response)
}))

app.post(`/${CONNECTIONS_API_PROBE}`, verifyLocalhost, asyncHandler(async (req, res) => {
    console.log(`probe: serverState.myLanStoragePath - ${serverState.myLanStoragePath}`)
    const args: ProbeConnectionsArgs = req.body
    serverState.myUsername = args.username
    if (getAmHosting()) {
        broadcastPushHostDataMaybe(() => handleGetStorageProjects({ clientId: args.clientId }))
    }
    const response: ProbeConnectionsResponse = await handleProbeConnections(args)
    res.json(response)
}))

app.post(`/${CONNECTIONS_API_CONNECT}`, verifyLocalhost, asyncHandler(async (req, res) => {
    console.log(`connectToUrl: serverState.myLanStoragePath - ${serverState.myLanStoragePath}`)
    const args: ConnectArgs = req.body
    // lookup connection info for serverId
    const host = serverState.hosts[args.serverId]
    if (host) {
        const url = createUrl(host.protocol, host.ip, host.port)
        if (host.protocol === 'http') {
            setProxy({ serverId: args.serverId, url })
            const response: ConnectResponse = { connectionUrl: url }
            res.json(response) // todo: JSON.stringify host computer name etc...
            return
        } else if (host.protocol === 'file') {
            const { connectionUrl: newStoragePath } = await handleConnectToUrl({ url })
            setLANStoragePath(newStoragePath)
            broadcastPushHostDataMaybe(() => handleGetStorageProjects({ clientId: args.clientId }))
            res.json(newStoragePath)
            return
        } else {
            throw new Error (`Unknown protocol: ${host.protocol}`)
        }
    }
    throw new Error(`Server not found: ${args.serverId}`)
}))

function verifyLocalhostUnlessHosting(req: express.Request, res: express.Response, next: express.NextFunction): void {
    if (serverState.allowHosting && !req.headers.host.startsWith('localhost:')) {
        // look for custom header that indicates intended serverId
        const serverId = req.headers['x-sltt-app-storage-server-id']
        if (serverId !== serverState.myServerId) {
            console.error(`Forbidden: "${req.headers.host}://${req.originalUrl}" from "${req.ip}". Expected serverId "${serverState.myServerId}" but got "${serverId}"`)
            res.status(403).json({ error: 'Forbidden' })
            return
        }
        next()
        return
    }
    verifyLocalhost(req, res, next)
}

app.post(`/${CONNECTIONS_API_GET_STORAGE_PROJECTS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: GetStorageProjectsArgs = req.body
    const response: GetStorageProjectsResponse = await handleGetStorageProjects(args)
    res.json(response)
}))

app.post(`/${CONNECTIONS_API_ADD_STORAGE_PROJECT}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: AddStorageProjectArgs = req.body
    await handleAddStorageProject(args)
    const response: AddStorageProjectResponse = { ok: true }
    res.json(response)
}))

app.post(`/${CONNECTIONS_API_REMOVE_STORAGE_PROJECT}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: RemoveStorageProjectArgs = req.body
    await handleRemoveStorageProject(args)
    const response: RemoveStorageProjectResponse = { ok: true }
    res.json(response)
}))

app.post(`/${CLIENTS_API_REGISTER_CLIENT_USER}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: RegisterClientUserArgs = req.body
    const response: RegisterClientUserResponse = await handleRegisterClientUser(getClientsPath(), args)
    res.json(response)
}))

app.post(`/${BLOBS_API_RETRIEVE_BLOB}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: RetrieveBlobArgs = req.body
    let response: RetrieveBlobResponse = await handleRetrieveBlob(getBlobsPath(), args)
    if (response.blobBase64 === null) {
        // maybe it was in the process of getting moved from the upload queue?
        console.warn(`retrieveBlob (${args.blobId}) not found. trying again...`)
        const response2: RetrieveBlobResponse = await handleRetrieveBlob(getBlobsPath(), args)
        response = response2
    }
    console.log(`retrieveBlob (${args.blobId}) buffer size: ${response.blobBase64?.length || 0} isUploaded: ${response.isUploaded}`)
    res.json(response)
}))

app.post(`/${BLOBS_API_STORE_BLOB}`, verifyLocalhostUnlessHosting, multiUpload.single('blob'), asyncHandler(async (req, res) => {
    const origArgs: StoreBlobArgs = {
        clientId: req.body['clientId'],
        blobId: req.body['blobId'],
        blob: req.file,
        isUploaded: req.body['isUploaded'] === 'true',
        vcrTotalBlobs: Number(req.body['vcrTotalBlobs']),
    }
    const args: HandleStoreBlobArgs = {
        clientId: origArgs.clientId,
        blobId: origArgs.blobId,
        file: origArgs.blob as File,
        isUploaded: origArgs.isUploaded,
        vcrTotalBlobs: origArgs.vcrTotalBlobs,
    }
    const response: StoreBlobResponse = await handleStoreBlob(getBlobsPath(), args)
    res.json(response)
}))

app.post(`/${BLOBS_API_RETRIEVE_BLOB_INFO}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: RetrieveBlobInfoArgs = req.body
    const response: RetrieveBlobInfoResponse = await handleRetrieveBlobInfo(getBlobsPath(), args)
    res.json(response)
}))

app.post(`/${BLOBS_API_UPDATE_BLOB_UPLOADED_STATUS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: UpdateBlobUploadedStatusArgs = req.body
    const response: UpdateBlobUploadedStatusResponse = await handleUpdateBlobUploadedStatus(getBlobsPath(), args)
    res.json(response)
}))


app.post(`/${BLOBS_API_RETRIEVE_ALL_BLOB_IDS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: RetrieveAllBlobIdsArgs = req.body
    const response: RetrieveAllBlobIdsResponse = await handleRetrieveAllBlobIds(getBlobsPath(), args)
    res.json(response)
}))

app.post(`/${DOCS_API_STORE_REMOTE_DOCS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: StoreRemoteDocsArgs<IDBModDoc> = req.body
    const response: StoreRemoteDocsResponse = await handleStoreRemoteDocs(getDocsPath(), args)
    res.json(response)
}))

app.post(`/${DOCS_API_RETRIEVE_REMOTE_DOCS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: RetrieveRemoteDocsArgs = req.body
    const response: RetrieveRemoteDocsResponse<IDBModDoc> = await handleRetrieveRemoteDocs(getDocsPath(), args)
    res.json(response)
}))

app.post(`/${DOCS_API_SAVE_REMOTE_SPOTS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: SaveRemoteSpotsArgs = req.body
    await handleSaveRemoteSpots(getDocsPath(), args)
    const response: SaveRemoteSpotsResponse = { ok: true }
    res.json(response)
}))

app.post(`/${DOCS_API_GET_REMOTE_SPOTS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: GetRemoteSpotsArgs = req.body
    const response: GetRemoteSpotsResponse = await handleGetRemoteSpots(getDocsPath(), args)
    res.json(response)
}))

app.post(`/${DOCS_API_STORE_LOCAL_DOCS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: StoreLocalDocsArgs<IDBModDoc> = req.body
    const response: StoreLocalDocsResponse = await handleStoreLocalDocs(getDocsPath(), args)
    res.json(response)
}))

app.post(`/${DOCS_API_GET_STORED_LOCAL_CLIENT_IDS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: GetStoredLocalClientIdsArgs = req.body
    const response: GetStoredLocalClientIdsResponse = await handleGetStoredLocalClientIds(getDocsPath(), args)
    res.json(response)
}))

app.post(`/${DOCS_API_RETRIEVE_LOCAL_CLIENT_DOCS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: RetrieveLocalClientDocsArgs = req.body
    const response: RetrieveLocalClientDocsResponse<IDBModDoc> = await handleRetrieveLocalClientDocs(getDocsPath(), args)
    res.json(response)
}))

app.post(`/${DOCS_API_SAVE_LOCAL_SPOTS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: SaveLocalSpotsArgs = req.body
    await handleSaveLocalSpots(getDocsPath(), args)
    const response: SaveLocalSpotsResponse = { ok: true }
    res.json(response)
}))

app.post(`/${DOCS_API_GET_LOCAL_SPOTS}`, verifyLocalhostUnlessHosting, asyncHandler(async (req, res) => {
    const args: GetLocalSpotsArgs = req.body
    const response: GetLocalSpotsResponse = await handleGetLocalSpots(getDocsPath(), args)
    res.json(response)
}))

export const startStorageServer = async (configFilePath: string): Promise<void> => {
    try {
        await loadServerSettings(configFilePath).then(async (settings) => {
            configSettingsPath = configFilePath
            let needsToSave = false
            if (!settings.myServerId) {
                serverState.myServerId = `${hostname()}__${new Date().toISOString()}`
                needsToSave = true
            } else {
                serverState.myServerId = settings.myServerId
            }
            serverState.allowHosting = settings.allowHosting
            setLANStoragePath(settings.myLanStoragePath)
            if (needsToSave) {
                await saveServerSettings(configFilePath, serverState)
            }
            if (getAmHosting()) {
                console.log('Starting UDP messaging to allowHosting')
                await cleanupUploadQueueFolder(getBlobsPath())
                startAllUdpMessaging()
                broadcastPushHostDataMaybe(() => handleGetStorageProjects({ clientId: MY_CLIENT_ID }))
            }
            app.listen(PORT, () => {
                console.log(`Storage server is running localhost port ${PORT}`)
            })
        })
    } catch (error) {
        reportToRollbar({
            error: error as Error, custom: {
                context: 'storage/server: startStorageServer',
                serverState,
                serverConfig,
                udpState,
                configFilePath,
            }
        })
    }
}
