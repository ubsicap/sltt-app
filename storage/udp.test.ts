import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import dgram from 'dgram'
import { startUdpClient, broadcastPushHostDataMaybe, getMyActivePeers, getDiskUsage, hostUpdateIntervalMs, BROADCAST_ADDRESS, UDP_CLIENT_PORT, pruneExpiredHosts, handleMessages, MSG_PUSH_HOST_INFO, MSG_DISCOVER_MY_UDP_IP_ADDRESS } from './udp'
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
    getServerConfig: (): ReturnType<typeof getServerConfig> => ({ port: UDP_CLIENT_PORT })
}))
vi.mock('diskusage', () => ({
    default: { check: vi.fn() },
    check: vi.fn()
}))

describe('UDP Client', () => {
    let myClient: dgram.Socket
    let udpState: ReturnType<typeof startUdpClient>

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
            address: vi.fn(() => ({ address: '127.0.0.1', port: UDP_CLIENT_PORT })),
            setBroadcast: vi.fn(),
        } as unknown as dgram.Socket
        vi.spyOn(dgram, 'createSocket').mockReturnValue(myClient);
        serverState.hosts = {}
        serverState.myServerId = 'my-server-id'
        serverState.allowHosting = false
        serverState.myLanStoragePath = ''
        udpState = startUdpClient()
    })

    it('should initialize UDP client and send discovery message', () => {
        expect(myClient.on).toHaveBeenCalledWith('message', expect.any(Function))
        expect(myClient.on).toHaveBeenCalledWith('listening', expect.any(Function))
        expect(myClient.bind).toHaveBeenCalledWith(UDP_CLIENT_PORT)
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

    it('should handle discovery message and respond with UDP IP address', async () => {
        const msg = Buffer.from(JSON.stringify({
            client: {
                serverId: 'my-server-id',
                startedAt: udpState.startedAt,
                computerName: udpState.myComputerName,
                user: 'test-user',
            },
            message: {
                createdAt: new Date().toISOString(),
                type: 'request',
                id: MSG_DISCOVER_MY_UDP_IP_ADDRESS,
                json: '{}',
            },
        }))
        const rinfo = { address: '123.4.5.6', port: UDP_CLIENT_PORT } as dgram.RemoteInfo
        await handleMessages(msg, rinfo)
        expect(udpState.myUdpIpAddress).toBe(rinfo.address)
        expect(myClient.send).toHaveBeenCalledWith(expect.any(Buffer), 0, expect.any(Number), rinfo.port, rinfo.address, expect.any(Function))
    })
    
    it('should handle push host info message and update server state', async () => {
        const msg = Buffer.from(JSON.stringify({
            client: {
                serverId: 'peer1',
                startedAt: '2023-01-01T00:00:00Z',
                computerName: 'computer1',
                user: 'user1',
            },
            message: {
                createdAt: new Date().toISOString(),
                type: 'push',
                id: MSG_PUSH_HOST_INFO,
                json: JSON.stringify({
                    port: UDP_CLIENT_PORT,
                    projects: ['project1', 'project2'],
                    peers: {},
                    diskUsage: { available: 100, free: 50, total: 150 },
                }),
            },
        }))
        const rinfo = { address: '127.0.0.1', port: UDP_CLIENT_PORT } as dgram.RemoteInfo
        await handleMessages(msg, rinfo)
        expect(serverState.hosts['peer1']).toBeDefined()
        expect(serverState.hosts['peer1'].projects).toEqual(['project1', 'project2'])
        expect(serverState.hosts['peer1'].diskUsage).toEqual({ available: 100, free: 50, total: 150 })
        expect(myClient.send).toHaveBeenCalledWith(expect.any(Buffer), 0, expect.any(Number), rinfo.port, rinfo.address, expect.any(Function))
    })
    
    it('should handle push host info response and update peer info', async () => {
        serverState.hosts['peer1'] = {
            serverId: 'peer1',
            peers: {},
        } as HostInfo
        const msg = Buffer.from(JSON.stringify({
            client: {
                serverId: 'peer2',
                startedAt: '2023-01-01T00:00:00Z',
                computerName: 'computer2',
                user: 'user2',
            },
            message: {
                createdAt: new Date().toISOString(),
                type: 'response',
                id: MSG_PUSH_HOST_INFO,
                json: JSON.stringify({
                    port: UDP_CLIENT_PORT,
                    hostServerId: 'peer1',
                    hostUpdatedAt: new Date().toISOString(),
                    isClient: false,
                }),
            },
        }))
        const rinfo = { address: '127.0.0.1', port: UDP_CLIENT_PORT } as dgram.RemoteInfo
        await handleMessages(msg, rinfo)
        expect(serverState.hosts['peer1'].peers['peer2']).toBeDefined()
        expect(serverState.hosts['peer1'].peers['peer2'].computerName).toBe('computer2')
    })
})
