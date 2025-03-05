import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import dgram from 'dgram'
import { startUdpClient, broadcastPushHostDataMaybe, getMyActivePeers, getDiskUsage, hostUpdateIntervalMs, BROADCAST_ADDRESS, UDP_CLIENT_PORT, pruneExpiredHosts } from './udp'
import { serverState, HostInfo, PeerInfo, getAmHosting } from './serverState'
import { getServerConfig } from './serverConfig'
import disk from 'diskusage'

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
    default: { check: vi.fn() },
    check: vi.fn()
}))

describe('UDP Client', () => {
    let myClient: dgram.Socket

    beforeEach(() => {
        const createdAt = new Date().toISOString()
        myClient = {
            createdAt,
            on: vi.fn(),
            send: vi.fn((msg, start, msgLength, port, address, cb: (err) => {}) => {
                cb(null)
                console.log(`[${createdAt}] Sent message: ${msg.toString()} to ${address}:${port}`, start, msgLength)
            }),
            bind: vi.fn(),
            address: vi.fn(() => ({ address: '127.0.0.1', port: 41234 })),
            setBroadcast: vi.fn(),
        } as unknown as dgram.Socket
        vi.spyOn(dgram, 'createSocket').mockReturnValue(myClient);
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
        (getAmHosting as Mock).mockReturnValue(true)
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
            updatedAt: '2023-01-02T00:00:00Z',
            serverId: 'my-server-id',
            peers,
        } as HostInfo
        const result = getMyActivePeers()
        expect(result).toEqual({
            'peer2': peers['peer2'],
        })
    })

    it('should get disk usage correctly', async () => {
        const mockDiskUsage = { available: 100, free: 50, total: 150 };
        (disk.check as Mock).mockResolvedValue(mockDiskUsage)
        const result = await getDiskUsage()
        expect(result).toEqual(mockDiskUsage)
    })

    it('should broadcast host data if hosting', async () => {
        (getAmHosting as Mock).mockReturnValue(true);
        const mockProjects = ['project1', 'project2']
        const fnGetProjects = vi.fn().mockResolvedValue(mockProjects)
        await broadcastPushHostDataMaybe(fnGetProjects)
        expect(fnGetProjects).toHaveBeenCalled()
        expect(myClient.send).toHaveBeenCalledWith(expect.any(Buffer), 0, expect.any(Number), UDP_CLIENT_PORT, BROADCAST_ADDRESS, expect.any(Function))
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
        pruneExpiredHosts()
        expect(serverState.hosts).toEqual({
            'host2': {
                serverId: 'host2',
                peers: {
                    'my-server-id': host2Peers['my-server-id']
                }
            }
        })
    })
})
