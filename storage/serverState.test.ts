import { describe, it, expect, beforeEach } from 'vitest'
import { serverState, getHostsByRelevance, HostInfo } from './serverState'

describe('getHostsByRelevance', () => {
    beforeEach(() => {
        serverState.hosts = {}
        serverState.myServerId = 'my-server-id'
        serverState.allowHosting = false
        serverState.myLanStoragePath = ''
    })

    it('should return an empty array when there are no hosts', () => {
        const result = getHostsByRelevance()
        expect(result).toEqual([])
    })

    it('should return hosts sorted by `serverId` relevance when hosting', () => {
        serverState.allowHosting = true
        serverState.myLanStoragePath = 'some-path'

        const host1: HostInfo = {
            serverId: 'host1',
            startedAt: '',
            updatedAt: '',
            computerName: '',
            user: '',
            protocol: '',
            ip: '',
            port: 0,
            projects: [],
            peers: {
                'my-server-id': {
                    serverId: 'my-server-id',
                    startedAt: '',
                    updatedAt: '',
                    computerName: '',
                    user: '',
                    protocol: '',
                    ip: '',
                    port: 0,
                    hostUpdatedAt: '',
                    hostPeersAt: '2023-01-01T00:00:00Z',
                    isClient: false
                }
            },
            diskUsage: undefined
        }

        const host2: HostInfo = {
            serverId: 'host2',
            startedAt: '',
            updatedAt: '',
            computerName: '',
            user: '',
            protocol: '',
            ip: '',
            port: 0,
            projects: [],
            peers: {
                'my-server-id': {
                    serverId: 'my-server-id',
                    startedAt: '',
                    updatedAt: '',
                    computerName: '',
                    user: '',
                    protocol: '',
                    ip: '',
                    port: 0,
                    hostUpdatedAt: '',
                    hostPeersAt: '2023-01-02T00:00:00Z',
                    isClient: false
                }
            },
            diskUsage: undefined
        }

        const myHost: HostInfo = {
            serverId: 'my-server-id',
            startedAt: '',
            updatedAt: '',
            computerName: '',
            user: '',
            protocol: '',
            ip: '',
            port: 0,
            projects: [],
            peers: {
                'my-server-id': {
                    serverId: 'my-server-id',
                    startedAt: '',
                    updatedAt: '',
                    computerName: '',
                    user: '',
                    protocol: '',
                    ip: '',
                    port: 0,
                    hostUpdatedAt: '',
                    hostPeersAt: '2023-01-02T00:00:00Z',
                    isClient: false
                }
            },
            diskUsage: undefined
        }

        serverState.hosts = {
            'host1': host1,
            'host2': host2,
            'my-server-id': myHost,
        }

        const result = getHostsByRelevance()
        expect(result).toEqual([myHost, host1, host2])
    })

    it('should return hosts sorted by `hostPeersAt` relevance when not hosting', () => {
        const host1: HostInfo = {
            serverId: 'host1',
            startedAt: '',
            updatedAt: '',
            computerName: '',
            user: '',
            protocol: '',
            ip: '',
            port: 0,
            projects: [],
            peers: {
                'my-server-id': {
                    serverId: 'my-server-id',
                    startedAt: '',
                    updatedAt: '',
                    computerName: '',
                    user: '',
                    protocol: '',
                    ip: '',
                    port: 0,
                    hostUpdatedAt: '',
                    hostPeersAt: '2023-01-03T00:00:00Z',
                    isClient: false
                }
            },
            diskUsage: undefined
        }

        const host2: HostInfo = {
            serverId: 'host2',
            startedAt: '',
            updatedAt: '',
            computerName: '',
            user: '',
            protocol: '',
            ip: '',
            port: 0,
            projects: [],
            peers: {
                'my-server-id': {
                    serverId: 'my-server-id',
                    startedAt: '',
                    updatedAt: '',
                    computerName: '',
                    user: '',
                    protocol: '',
                    ip: '',
                    port: 0,
                    hostUpdatedAt: '',
                    hostPeersAt: '2023-01-02T00:00:00Z',
                    isClient: false
                }
            },
            diskUsage: undefined
        }

        serverState.hosts = {
            'host1': host1,
            'host2': host2
        }

        const result = getHostsByRelevance()
        expect(result).toEqual([host2, host1])
    })
})
