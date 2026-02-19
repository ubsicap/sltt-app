import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleGetStorageProjects, handleAddStorageProject, handleRemoveStorageProject, handleProbeConnections } from './connections'
import { readFile, appendFile } from 'fs/promises'
import { getLANStoragePath, getHostsByRelevance, serverState, HostInfo, createUrl } from './serverState'
import { broadcastPushHostDataMaybe } from './udp'
import { ProbeConnectionsResponse } from './connections.d'

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

beforeEach(() => {
    vi.resetAllMocks()
    serverState.hosts = {}
    serverState.myHostPeers = {}
    serverState.hostProjects = new Set()
    serverState.allowHosting = false
    serverState.myServerId = ''
    serverState.myLanStoragePath = ''
})

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
    }: { whitelistContent: string | undefined, expectedProjects: string[] }) => {
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
    it.each([
        { case: 'above minimum disk space', availableMb: 75, expectedAccessible: true },
        { case: 'below minimum disk space', availableMb: 25, expectedAccessible: false },
    ])('should return the list of connections - $case', async ({
        availableMb, expectedAccessible
    }: { availableMb: number, expectedAccessible: boolean }
) => {
        const clientId = 'test-client'
        const username = 'user1'
        const hostsByRelevance: HostInfo[] = [
            {
                serverId: 'server1', protocol: 'http', ip: '123.4.5.6', port: 12345, projects: [],
                computerName: 'computer1', user: 'user1', startedAt: '2021-01-01', updatedAt: '2021-01-01',
                diskUsage: { available: availableMb * 1024 * 1024, free: (availableMb + 50) * 1024 * 1024, total: 1000 * 1024 * 1024 },
            },
        ]
        vi.mocked(createUrl).mockImplementation((protocol, ip, port) => `${protocol}://${ip}:${port}`)
        vi.mocked(getHostsByRelevance).mockReturnValue(hostsByRelevance)
        serverState.allowHosting = true
        serverState.myServerId = 'server1'
        serverState.myLanStoragePath = 'test-path'
        serverState.myServerId = 'server1'
        serverState.hosts['server1'] = hostsByRelevance[0]

        const result: ProbeConnectionsResponse = await handleProbeConnections({ clientId, username })
        expect(result).toHaveLength(1)
        const { accessible, connectionInfo } = result[0]
        expect(accessible).toBe(expectedAccessible)
        expect(connectionInfo).not.toBeNull()
        expect(connectionInfo.isMyServer).toBe(true)
        expect(connectionInfo.user).toBe(username)
        // expect(result).toMatchSnapshot()
    })
})
