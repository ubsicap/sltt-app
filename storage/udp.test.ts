import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import dgram from 'dgram'
import { startUdpClient, broadcastPushHostDataMaybe, getMyActivePeers, getDiskUsage, hostUpdateIntervalMs } from './udp'
import { serverState, HostInfo, PeerInfo } from './serverState'
import { getServerConfig } from './serverConfig'
import { check } from 'diskusage'

vi.mock('dgram')
vi.mock('os', () => ({ hostname: (): string => 'test-hostname' }))
vi.mock('./serverState', () => ({
    createUrl: vi.fn(),
    getAmHosting: vi.fn(),
    serverState: {
        hosts: {},
        myServerId: 'my-server-id',
        myUsername: 'test-user',
        allowHosting: false,
        myLanStoragePath: '',
        proxyServerId: '',
        hostProjects: new Set(),
    },
}))
vi.mock('./serverConfig', () => ({
    getServerConfig: (): ReturnType<typeof getServerConfig> => ({ port: 41234 })
}))
vi.mock('diskusage', () => ({
    check: vi.fn()
}))

describe('UDP Client', () => {
    let myClient: dgram.Socket

    beforeEach(() => {
        myClient = {
            on: vi.fn(),
            send: vi.fn(),
            bind: vi.fn(),
            address: vi.fn(() => ({ address: '127.0.0.1', port: 41234 })),
            setBroadcast: vi.fn(),
        } as unknown as dgram.Socket
        vi.spyOn(dgram, 'createSocket').mockReturnValue(myClient)
        serverState.hosts = {}
        serverState.myServerId = 'my-server-id'
        serverState.allowHosting = false
        serverState.myLanStoragePath = ''
        startUdpClient()
    })

    it('should initialize UDP client and send discovery message', () => {
        expect(myClient.on).toHaveBeenCalledWith('message', expect.any(Function))
        expect(myClient.on).toHaveBeenCalledWith('listening', expect.any(Function))
        expect(myClient.bind).toHaveBeenCalledWith(41234)
    })

    it('should get active peers correctly', () => {
        const peers: { [serverId: string]: PeerInfo } = {
            'peer1': {
                serverId: 'peer1',
                startedAt: '2023-01-01T00:00:00Z',
                computerName: 'computer1',
                user: 'user1',
                protocol: 'http',
                ip: '',
                port: 0,
                hostUpdatedAt: '2023-01-01T00:00:00Z',
                hostPeersAt: '2023-01-01T00:00:00Z',
                updatedAt: '2023-01-01T00:00:00Z',
                isClient: false,
            },
            'peer2': {
                serverId: 'peer2',
                startedAt: '2023-01-02T00:00:00Z',
                computerName: 'computer2',
                user: 'user2',
                protocol: 'http',
                ip: '',
                port: 0,
                hostUpdatedAt: '2023-01-02T00:00:00Z',
                hostPeersAt: '2023-01-02T00:00:00Z',
                updatedAt: '2023-01-02T00:00:00Z',
                isClient: false,
            }
        }
        serverState.hosts['my-server-id'] = {
            serverId: 'my-server-id',
            peers,
        } as HostInfo
        const result = getMyActivePeers()
        expect(result).toEqual({
            'peer1': { serverId: 'peer1', hostUpdatedAt: '2023-01-01T00:00:00Z' },
            'peer2': { serverId: 'peer2', hostUpdatedAt: '2023-01-02T00:00:00Z' },
        })
    })

    it('should get disk usage correctly', async () => {
        const mockDiskUsage = { available: 100, free: 50, total: 150 };
        (check as Mock).mockResolvedValue(mockDiskUsage)
        const result = await getDiskUsage()
        expect(result).toEqual(mockDiskUsage)
    })

    it('should broadcast host data if hosting', async () => {
        serverState.allowHosting = true
        const mockProjects = ['project1', 'project2']
        const fnGetProjects = vi.fn().mockResolvedValue(mockProjects)
        const sendMessage = vi.fn()
        vi.spyOn(require('./udp'), 'sendMessage').mockImplementation(sendMessage)
        await broadcastPushHostDataMaybe(fnGetProjects)
        expect(fnGetProjects).toHaveBeenCalled()
        expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'push',
            id: 'PUSH /storage-server/host',
            json: expect.any(String)
        }))
    })

    it('should remove expired hosts', () => {
        const now = new Date().getTime()
        const host1Peers: { [serverId: string]: PeerInfo } = {
            'my-server-id': {
                serverId: 'my-server-id',
                updatedAt: new Date(now - hostUpdateIntervalMs * 3).toISOString() as string,
                startedAt: '2023-01-01T00:00:00Z',
                computerName: 'computer1',
                user: 'user1',
                protocol: 'http',
                ip: '',
                port: 0,
                hostUpdatedAt: '2023-01-01T00:00:00Z',
                hostPeersAt: '2023-01-01T00:00:00Z',
                isClient: false,
            }
        }
        const host2Peers: { [serverId: string]: PeerInfo } = {
            'my-server-id': {
                serverId: 'my-server-id',
                updatedAt: new Date(now - hostUpdateIntervalMs).toISOString() as string,
                startedAt: '2023-01-01T00:00:00Z',
                computerName: 'computer1',
                user: 'user1',
                protocol: 'http',
                ip: '',
                port: 0,
                hostUpdatedAt: '2023-01-01T00:00:00Z',
                hostPeersAt: '2023-01-01T00:00:00Z',
                isClient: false,
            }
        }
        serverState.hosts['host1'] = {
            serverId: 'host1',
            peers: host1Peers
        } as HostInfo
        serverState.hosts['host2'] = {
            serverId: 'host2',
            peers: host2Peers
        } as HostInfo
        vi.useFakeTimers()
        vi.advanceTimersByTime(1000)
        expect(serverState.hosts).toEqual({
            'host2': {
                serverId: 'host2',
                peers: {
                    'my-server-id': { updatedAt: new Date(now - hostUpdateIntervalMs).toISOString() }
                }
            }
        })
        vi.useRealTimers()
    })
})
