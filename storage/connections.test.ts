import { describe, it, expect, vi } from 'vitest'
import { handleGetStorageProjects, handleAddStorageProject, handleRemoveStorageProject, handleProbeConnections, handleConnectToUrl } from './connections'
import { readFile, appendFile } from 'fs/promises'
import { getLANStoragePath, getHostsByRelevance, serverState } from './serverState'
import axios from 'axios'
import { broadcastPushHostDataMaybe } from './udp'

export {}
vi.mock('fs/promises')
vi.mock('./serverState')
vi.mock('axios')
vi.mock('./udp')

class MockedNodeError extends Error {
    code: string
    constructor(code: string) {
        super()
        this.code = code
    }
}

describe('handleGetStorageProjects', () => {
    it.each([
        { case: 'no whitelist', whitelistContent: undefined, expectedProjects: [] },
        { case: 'empty whitelist', whitelistContent: '', expectedProjects: [] },
        { case: 'added project1', whitelistContent: 'timestamp\t+\tproject1\tadminEmail\n', expectedProjects: ['project1'] },
        { case: 'removed project1', whitelistContent: 'timestamp\t+\tproject1\tadminEmail\ntimestamp\t-\tproject1\tadminEmail\n', expectedProjects: [] },
        { case: 'added project1, project2', whitelistContent: 'timestamp\t+\tproject1\tadminEmail\ntimestamp\t+\tproject2\tadminEmail\n', expectedProjects: ['project1', 'project2'] },
        { case: 'removed project1, added project2', whitelistContent: 'timestamp\t+\tproject1\tadminEmail\ntimestamp\t-\tproject1\tadminEmail\ntimestamp\t+\tproject2\tadminEmail\n', expectedProjects: ['project2'] },
    ])('should return the list of storage projects - $case', async ({
        whitelistContent,
        expectedProjects
    }: { whitelistContent: string, expectedProjects: string[] }) => {
        const clientId = 'test-client'
        const lanStoragePath = 'test-path'
        vi.mocked(getLANStoragePath).mockReturnValue(lanStoragePath)
        if (whitelistContent !== undefined) {
            vi.mocked(readFile).mockResolvedValue(whitelistContent)
        } else {
            vi.mocked(readFile).mockRejectedValue(new MockedNodeError('ENOENT'))
        }
        const result = await handleGetStorageProjects({ clientId })

        expect(result).toEqual(expectedProjects)
        expect(readFile).toHaveBeenCalledWith(`${lanStoragePath}/whitelist.sltt-projects`, 'utf-8')
    })
})

describe('handleAddStorageProject', () => {
    it('should add a new storage project', async () => {
        const clientId = 'test-client'
        const project = 'new-project'
        const adminEmail = 'admin@example.com'
        const lanStoragePath = 'test-path'
        vi.mocked(getLANStoragePath).mockReturnValue(lanStoragePath)
        vi.mocked(readFile).mockRejectedValue(new MockedNodeError('ENOENT'))

        await handleAddStorageProject({ clientId, project, adminEmail })

        expect(readFile).toHaveBeenCalledWith(`${lanStoragePath}/whitelist.sltt-projects`, 'utf-8')
        expect(appendFile).toHaveBeenCalledWith(`${lanStoragePath}/whitelist.sltt-projects`, expect.stringContaining(`\t+\t${project}\t${adminEmail}\n`))
        expect(broadcastPushHostDataMaybe).toHaveBeenCalled()
    })

    it('should not add an existing storage project', async () => {
        const clientId = 'test-client'
        const project = 'existing-project'
        const adminEmail = 'admin@example.com'
        const lanStoragePath = 'test-path'
        vi.mocked(getLANStoragePath).mockReturnValue(lanStoragePath)
        vi.mocked(readFile).mockResolvedValue('timestamp\t+\texisting-project\n')

        await handleAddStorageProject({ clientId, project, adminEmail })

        expect(readFile).toHaveBeenCalledWith(`${lanStoragePath}/whitelist.sltt-projects`, 'utf-8')
        expect(appendFile).not.toHaveBeenCalled()
        expect(broadcastPushHostDataMaybe).not.toHaveBeenCalled()
    })
})

describe('handleRemoveStorageProject', () => {
    it('should remove an existing storage project', async () => {
        const clientId = 'test-client'
        const project = 'existing-project'
        const adminEmail = 'admin@example.com'
        const lanStoragePath = 'test-path'
        vi.mocked(getLANStoragePath).mockReturnValue(lanStoragePath)
        vi.mocked(readFile).mockResolvedValue('timestamp\t+\texisting-project\n')

        await handleRemoveStorageProject({ clientId, project, adminEmail })

        expect(appendFile).toHaveBeenCalledWith(`${lanStoragePath}/whitelist.sltt-projects`, expect.stringContaining(`\t-\t${project}\t${adminEmail}\n`))
        expect(broadcastPushHostDataMaybe).toHaveBeenCalled()
    })
})

describe('handleProbeConnections', () => {
    it('should return the list of connections', async () => {
        const clientId = 'test-client'
        const hostsByRelevance = [{ protocol: 'http', ip: '127.0.0.1', port: 8080, peers: {}, serverId: 'server1' }]
        vi.mocked(getHostsByRelevance).mockReturnValue(hostsByRelevance)
        vi.mocked(serverState).mockReturnValue({
            myUsername: 'user',
            myServerId: 'server1',
            hosts: {
                server1: {
                    protocol: 'http',
                    peers: {},
                    projects: [],
                    diskUsage: { available: 100 }
                }
            }
        })

        const result = await handleProbeConnections({ clientId })

        expect(result).toEqual(expect.any(Array))
    })
})

describe('handleConnectToUrl', () => {
    it('should connect to a file URL', async () => {
        const url = 'file:///test-path'
        const filePath = '/test-path'
        vi.mocked(fileURLToPath).mockReturnValue(filePath)
        vi.mocked(access).mockResolvedValue(undefined)

        const result = await handleConnectToUrl({ url })

        expect(result).toEqual({ connectionUrl: filePath })
    })

    it('should connect to an HTTP URL', async () => {
        const url = 'http://localhost:8080'
        vi.mocked(axios.get).mockResolvedValue({ data: {} })

        const result = await handleConnectToUrl({ url })

        expect(result).toEqual({ connectionUrl: url })
    })
})