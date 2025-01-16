import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import { join } from 'path'
import { handleGetLocalSpots, handleGetRemoteSpots, handleGetStoredLocalClientIds, handleRetrieveLocalClientDocs, handleRetrieveRemoteDocs, handleSaveLocalSpots, handleSaveRemoteSpots, handleStoreLocalDocs, handleStoreRemoteDocs, IDBModDoc } from './docs'
import { getLANStoragePath as buildLANStoragePath } from './core'
import { listVcrFiles, retrieveVcrs, storeVcr } from './vcrs'
import { AddStorageProjectArgs, ConnectToUrlArgs, GetStorageProjectsArgs, ProbeConnectionsArgs, RemoveStorageProjectArgs } from './connections.d'
import { handleAddStorageProject, handleConnectToUrl, handleGetStorageProjects, handleProbeConnections, handleRemoveStorageProject } from './connections'
import { RetrieveBlobArgs, StoreBlobArgs } from './blobs.d'
import { handleRetrieveAllBlobIds, handleRetrieveBlob, handleStoreBlob } from './blobs'
import { handleRegisterClientUser } from './clients'
import { GetStoredLocalClientIdsArgs, RetrieveRemoteDocsArgs, SaveRemoteSpotsArgs, StoreRemoteDocsArgs } from './docs.d'
import { setupUDPServer } from './udp'

const app = express()
const PORT = Number(process.env.PORT) || 45177

console.log('Starting UDP server on port', PORT)
setupUDPServer(PORT)

app.use(cors())
app.use(bodyParser.json())

const DEFAULT_STORAGE_BASE_PATH = process.env.DEFAULT_STORAGE_BASE_PATH || 'userData'
let lanStoragePath = ''

const getLANStoragePath = (): string => lanStoragePath
const setLANStoragePath = (path: string): void => {
    if (path === lanStoragePath) return
    lanStoragePath = path
    console.log('lanStoragePath:', lanStoragePath)
}
const getBlobsPath = (): string => join(getLANStoragePath(), 'blobs')
const getVcrsPath = (): string => join(getLANStoragePath(), 'vcrs')
const getDocsPath = (): string => join(getLANStoragePath(), 'docs')
const getClientsPath = (): string => join(getLANStoragePath(), 'clients')

app.get('/status', (req, res) => {
    res.json({ status: 'ok' })
})

app.post('/getStorageProjects', async (req, res) => {
    const args: GetStorageProjectsArgs = req.body
    try {
        const result = await handleGetStorageProjects(args)
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post('/addStorageProject', async (req, res) => {
    const args: AddStorageProjectArgs = req.body
    try {
        await handleAddStorageProject(args)
        res.json({ message: 'Project added successfully' })
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post('/removeStorageProject', async (req, res) => {
    const args: RemoveStorageProjectArgs = req.body
    try {
        await handleRemoveStorageProject(args)
        res.json({ message: 'Project removed successfully' })
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post('/probeConnections', async (req, res) => {
    const args: ProbeConnectionsArgs = req.body
    try {
        const result = await handleProbeConnections(buildLANStoragePath(DEFAULT_STORAGE_BASE_PATH), args)
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post('/connectToUrl', async (req, res) => {
    const args: ConnectToUrlArgs = req.body
    try {
        const newStoragePath = await handleConnectToUrl(args)
        setLANStoragePath(newStoragePath)
        res.json({ newStoragePath })
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post('/registerClientUser', async (req, res) => {
    const { clientId, username } = req.body
    try {
        const result = await handleRegisterClientUser(getClientsPath(), { clientId, username })
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post('/retrieveBlob', async (req, res) => {
    const args: RetrieveBlobArgs = req.body
    try {
        const result = await handleRetrieveBlob(getBlobsPath(), args)
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post('/storeBlob', async (req, res) => {
    const args: StoreBlobArgs = req.body
    try {
        const result = await handleStoreBlob(getBlobsPath(), args)
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post('/retrieveAllBlobIds', async (req, res) => {
    const { clientId } = req.body
    try {
        const result = await handleRetrieveAllBlobIds(getBlobsPath(), { clientId })
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post('/storeVcr', async (req, res) => {
    const { clientId, videoCacheRecord } = req.body
    try {
        const result = await storeVcr(getVcrsPath(), { clientId, videoCacheRecord })
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post('/listVcrFiles', async (req, res) => {
    const { clientId, project } = req.body
    try {
        const result = await listVcrFiles(getVcrsPath(), { clientId, project })
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post('/retrieveVcrs', async (req, res) => {
    const { clientId, filename } = req.body
    try {
        const result = await retrieveVcrs(getVcrsPath(), { clientId, filename })
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post('/storeRemoteDocs', async (req, res) => {
    const args: StoreRemoteDocsArgs<IDBModDoc> = req.body
    try {
        const result = await handleStoreRemoteDocs(getDocsPath(), args)
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post('/retrieveRemoteDocs', async (req, res) => {
    const args: RetrieveRemoteDocsArgs = req.body
    try {
        const result = await handleRetrieveRemoteDocs(getDocsPath(), args)
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post('/saveRemoteSpots', async (req, res) => {
    const args: SaveRemoteSpotsArgs = req.body
    try {
        const result = await handleSaveRemoteSpots(getDocsPath(), args)
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post('/getRemoteSpots', async (req, res) => {
    const { clientId, project } = req.body
    try {
        const result = await handleGetRemoteSpots(getDocsPath(), { clientId, project })
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post('/storeLocalDocs', async (req, res) => {
    const { clientId, project, docs } = req.body
    try {
        const result = await handleStoreLocalDocs(getDocsPath(), { clientId, project, docs })
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post('/getStoredLocalClientIds', async (req, res) => {
    const { project }: GetStoredLocalClientIdsArgs = req.body
    try {
        const result = await handleGetStoredLocalClientIds(getDocsPath(), { project })
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post('/retrieveLocalClientDocs', async (req, res) => {
    const { clientId, localClientId, project, spot } = req.body
    try {
        const result = await handleRetrieveLocalClientDocs(getDocsPath(), { clientId, localClientId, project, spot })
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post('/saveLocalSpots', async (req, res) => {
    const { clientId, project, spots } = req.body
    try {
        const result = await handleSaveLocalSpots(getDocsPath(), { clientId, project, spots })
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.post('/getLocalSpots', async (req, res) => {
    const { clientId, project } = req.body
    try {
        const result = await handleGetLocalSpots(getDocsPath(), { clientId, project })
        res.json(result)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})
