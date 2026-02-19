import dgram from 'dgram'
import { hostname, networkInterfaces } from 'os'
import { createUrl, getAmHosting, HostInfo, PeerInfo, serverState } from './serverState'
import { getServerConfig } from './serverConfig'
import disk from 'diskusage'

export const BROADCAST_ADDRESS = '255.255.255.255'
export const UDP_CLIENT_PORT = 41234

export const MSG_DISCOVER_MY_UDP_IP_ADDRESS = 'GET /my-udp-ipaddress'
export const MSG_PUSH_HOST_INFO = 'PUSH /storage-server/host'

type UdpState = {
    startedAt: string
    myComputerName: string
    myUdpIpAddress: string
    myClient: ReturnType<typeof dgram.createSocket> | undefined
}

let udpState: UdpState
let warnedBroadcastUnreachable = false
let dumpedOversizedUdpMessage = false

const ipv4ToInt = (ip: string): number => {
    return ip.split('.').reduce((acc, octet) => ((acc << 8) | Number(octet)) >>> 0, 0)
}

const intToIpv4 = (value: number): string => {
    return [
        (value >>> 24) & 255,
        (value >>> 16) & 255,
        (value >>> 8) & 255,
        value & 255,
    ].join('.')
}

const getDirectedBroadcastAddresses = (): string[] => {
    const interfaces = networkInterfaces()
    const addresses = new Set<string>()
    for (const iface of Object.values(interfaces)) {
        if (!iface) continue
        for (const entry of iface) {
            const isIPv4 = entry.family === 'IPv4'
            if (!isIPv4 || entry.internal) continue
            if (!entry.address || !entry.netmask) continue
            const addressInt = ipv4ToInt(entry.address)
            const netmaskInt = ipv4ToInt(entry.netmask)
            const broadcastInt = (addressInt | (~netmaskInt >>> 0)) >>> 0
            addresses.add(intToIpv4(broadcastInt))
        }
    }
    return [...addresses]
}

type PushHostInfoBroadcast = {
    port: number,
    projects: string[],
    peerCount: number,
    clientCount: number,
    diskUsage: Awaited<ReturnType<typeof disk.check>> | undefined,
}

type PushHostInfoResponse = {
    port: number,
    hostServerId: string,
    hostUpdatedAt: string,
    isClient: boolean,
}

const isProxyClientActiveForHost = (hostServerId: string, now = new Date().getTime()): boolean => {
    if (serverState.proxyServerId !== hostServerId) return false
    if (!serverState.proxyServerIdAt) return false
    const proxyServerAgeMs = now - new Date(serverState.proxyServerIdAt).getTime()
    return proxyServerAgeMs <= peerExpirationMs
}

export type ClientMessage = {
    client: {
        serverId: string,
        startedAt: string,
        computerName: string,
        user: string,
    },
    message: {
        createdAt: string,
        type: 'request' | 'response' | 'push',
        id: string,
        json: string,
    }
}

const formatClientMsg = ({ type, id, json }: Omit<ClientMessage['message'], 'createdAt'>): string => {
    if (!udpState) throw new Error('UDP client not started')
    const payload: ClientMessage = {
        client: { serverId: serverState.myServerId, startedAt: udpState.startedAt, computerName: udpState.myComputerName, user: serverState.myUsername },
        message: {
            createdAt: new Date().toISOString(),
            type,
            id,
            json,
        },
    }
    return JSON.stringify(payload)
}

export const sendMessage = ({ type, id, json }: Omit<ClientMessage['message'], 'createdAt'>, port = UDP_CLIENT_PORT, address = BROADCAST_ADDRESS): void => {
    if (!udpState || !udpState.myClient) throw new Error('UDP client not started')
    const msg = formatClientMsg({ type, id, json })
    const messageSizeBytes = Buffer.byteLength(msg, 'utf8')
    const targetAddresses = address === BROADCAST_ADDRESS
        ? [BROADCAST_ADDRESS, ...getDirectedBroadcastAddresses()]
        : [address]
    const uniqueTargets = [...new Set(targetAddresses)]

    console.debug(`UDP message size: ${messageSizeBytes} bytes; id='${id}'; type='${type}'; targets=${JSON.stringify(uniqueTargets)}`)

    uniqueTargets.forEach((targetAddress) => {
        udpState.myClient?.send(msg, port, targetAddress, (err) => {
            if (err) {
                const isMessageTooLarge =
                    'code' in err &&
                    err.code === 'EMSGSIZE'

                if (isMessageTooLarge) {
                    if (!dumpedOversizedUdpMessage) {
                        console.error(`UDP message (${id}) too large (${messageSizeBytes} bytes) for '${targetAddress}:${port}'. Dumping payload once for debugging:`)
                        console.error(JSON.stringify(JSON.parse(msg), null, 2))
                        dumpedOversizedUdpMessage = true
                    }
                    return
                }

                const isBroadcastUnreachable =
                    targetAddress === BROADCAST_ADDRESS &&
                    'code' in err &&
                    err.code === 'EHOSTUNREACH'

                if (isBroadcastUnreachable) {
                    if (!warnedBroadcastUnreachable) {
                        console.warn(`UDP global broadcast unavailable (${targetAddress}:${port}): ${err.message}. Continuing with directed subnet broadcasts.`)
                        warnedBroadcastUnreachable = true
                    }
                    return
                }

                console.error(err)
                return
            }
            console.log(`Message sent to '${targetAddress}:${port}': ${id}`)
        })
    })
}

export const startUdpClient = (): UdpState => {
    if (udpState) return udpState
    udpState = { myClient: undefined, myUdpIpAddress: '', startedAt: '', myComputerName: '' }

    /** unlikely that two clients on the same network will start at the same time */
    const startedAt = new Date().toISOString()
    const myComputerName = hostname()
    console.log('My computer name:', myComputerName)
    console.log('UDP started at:', startedAt)
    const myUdpIpAddress = ''

    const myClient = dgram.createSocket('udp4')
    myClient.on('message', handleMessages)
    myClient.on('listening', () => {
        const address = myClient.address()
        console.log(`Client listening on ${address.address}:${address.port}`)
        myClient.setBroadcast(true)
        sendMessage({ type: 'request', id: MSG_DISCOVER_MY_UDP_IP_ADDRESS, json: '{}' })
    })

    myClient.bind(UDP_CLIENT_PORT)

    udpState = { myClient, myUdpIpAddress, startedAt, myComputerName }
    return udpState
}

export const handleMessages = async (msg: Buffer, rinfo: dgram.RemoteInfo) => {
    const clientData: ClientMessage = JSON.parse(msg.toString())
    const { message, client } = clientData
    if (client.computerName === udpState.myComputerName &&
        client.startedAt === udpState.startedAt && message.id !== MSG_PUSH_HOST_INFO
    ) {
        if (udpState.myUdpIpAddress !== rinfo.address) {
            udpState.myUdpIpAddress = rinfo.address
            console.log('My UDP IP address:', udpState.myUdpIpAddress)
        }
        if (message.type === 'request' && message.id === MSG_DISCOVER_MY_UDP_IP_ADDRESS) {
            sendMessage({ type: 'response', id: MSG_DISCOVER_MY_UDP_IP_ADDRESS, json: '{}' }, rinfo.port, rinfo.address)
            return
        }
        console.log('Ignoring own message:', JSON.stringify(clientData.message, null, 2))
        return
    }
    console.log(`Client received message '${message.id}' from '${rinfo.address}:${rinfo.port}':\n\t${msg}`)
    if (message.id === MSG_PUSH_HOST_INFO) {
        if (message.type === 'push') {
            const { port, projects, peerCount, clientCount, diskUsage }: PushHostInfoBroadcast = JSON.parse(message.json)
            const hostServerId = client.serverId
            const hostUpdatedAt = message.createdAt
            const protocol = 'http'
            const existingHost = serverState.hosts[client.serverId]
            const nowIso = new Date().toISOString()
            const myHostPeers = serverState.myHostPeers
            const effectivePeerCount = hostServerId === serverState.myServerId ? Object.keys(myHostPeers).length : peerCount
            const effectiveClientCount = hostServerId === serverState.myServerId ? Object.values(myHostPeers).filter(peer => peer.isClient).length : clientCount
            const updatedHost: HostInfo = {
                serverId: hostServerId,
                protocol,
                ip: rinfo.address,
                port,
                user: client.user,
                startedAt: client.startedAt,
                updatedAt: hostUpdatedAt,
                computerName: client.computerName,
                projects,
                diskUsage,
                peerCount: effectivePeerCount,
                clientCount: effectiveClientCount,
                discoveredAt: existingHost?.discoveredAt || nowIso,
                lastSeenAt: nowIso,
            }
            serverState.hosts[client.serverId] = updatedHost
            serverState.hostProjects = new Set(projects)
            console.log(`Host URL is: ${createUrl(protocol, rinfo.address, port)}`)
            console.log('Host serverId:', updatedHost.serverId)
            console.log('Host computer name:', updatedHost.computerName)
            console.log('Host started at:', updatedHost.startedAt)
            console.log('Host projects:', projects)
            console.log('Host peers count:', effectivePeerCount)
            // respond (as a peer) with our own local ip address and port information
            const payload: PushHostInfoResponse = {
                port: getServerConfig().port, hostServerId, hostUpdatedAt,
                isClient: isProxyClientActiveForHost(hostServerId),
            }
            sendMessage({
                type: 'response', id: MSG_PUSH_HOST_INFO,
                json: JSON.stringify(payload)
            }, rinfo.port, rinfo.address)
            return
        }
        if (message.type === 'response') {
            const { port, hostUpdatedAt, isClient }: PushHostInfoResponse = JSON.parse(message.json)
            // my host should update each peer's data
            const { startedAt, computerName, user } = client
            const existingPeer = serverState.myHostPeers[client.serverId]
            const peerUpdatedAt = message.createdAt
            const peerLastSeenAt = new Date().toISOString()
            const updatedPeer: PeerInfo = {
                serverId: client.serverId,
                computerName,
                startedAt,
                user,
                protocol: 'http',
                ip: rinfo.address,
                port,
                hostPeersAt: existingPeer ? existingPeer.hostPeersAt : new Date().toISOString(),
                hostUpdatedAt,
                isClient,
                updatedAt: peerUpdatedAt,
                lastSeenAt: peerLastSeenAt,
            }
            serverState.myHostPeers[client.serverId] = updatedPeer
            const peersCount = Object.keys(serverState.myHostPeers).length
            console.log('My peers count: ', peersCount)
            const clientCount = Object.values(serverState.myHostPeers).filter(peer => peer.isClient).length
            console.log('My clients count:', clientCount)
        }
    }
    // if (message.type === 'response' && message.id === MSG_SLTT_STORAGE_SERVER_URL) {
    //     const { ip, port } = JSON.parse(message.json)
    //     const serverUrl = createUrl('http', ip, port)
    //     console.log(`Discovered storage server at ${serverUrl}`)
    //     try {
    //         const response = await axios.get(`${serverUrl}/status`, {
    //             headers: {
    //                 'Content-Type': 'application/json',
    //             },
    //         });
    //         console.log('Response from storage server:', response.data);
    //     } catch (error) {
    //         console.error('Error connecting to storage server:', error);
    //     }
    //     return
    // }
}

/** if peerHostUpdatedAt does not match host.updatedAt, then remove peer as obsoleted */
export const getMyActivePeers = (): { [serverId: string]: PeerInfo } => {
    if (!getAmHosting()) return {}
    const myHost = serverState.hosts[serverState.myServerId]
    if (!myHost) return {}
    const myHostPeers = serverState.myHostPeers
    const activePeers: { [serverId: string]: PeerInfo } = {}
    Object.values(myHostPeers).forEach((peer) => {
        if (peer.hostUpdatedAt === myHost.updatedAt) {
            activePeers[peer.serverId] = peer
        }
    })
    return activePeers
}

export const pruneMyExpiredPeers = (now: number = new Date().getTime()): string[] => {
    const myHost = serverState.hosts[serverState.myServerId]
    if (!myHost) return []
    const stalePeerIds: string[] = []
    for (const [peerServerId, peer] of Object.entries(serverState.myHostPeers)) {
        const peerHeartbeatAt = peer.lastSeenAt || peer.updatedAt
        const isPeerObsolete = peer.hostUpdatedAt !== myHost.updatedAt
        const isPeerExpired = !peerHeartbeatAt || now - new Date(peerHeartbeatAt).getTime() > peerExpirationMs
        if (isPeerObsolete || isPeerExpired) {
            stalePeerIds.push(peerServerId)
        }
    }
    if (stalePeerIds.length > 0) {
        stalePeerIds.forEach((peerServerId) => {
            delete serverState.myHostPeers[peerServerId]
            console.log(`Removing expired peer '${peerServerId}' from host '${myHost.serverId}'`)
        })
        myHost.peerCount = Object.keys(serverState.myHostPeers).length
        myHost.clientCount = Object.values(serverState.myHostPeers).filter(peer => peer.isClient).length
    }
    return stalePeerIds
}

export const getDiskUsage = async (): Promise<Awaited<ReturnType<typeof disk.check>> | undefined> => {
    try {
        const startAt = new Date()
        console.debug('Checking disk usage...')
        const result = await disk.check(serverState.myLanStoragePath)
        const endAt = new Date()
        console.debug('Disk usage finished in', endAt.getTime() - startAt.getTime(), 'ms')
        return result
    } catch (error: unknown) {
        console.error('Error getting disk usage:', error)
    }
    return undefined
}

export const broadcastPushHostDataMaybe = async (fnGetProjects: () => Promise<string[]>): Promise<void> => {
    if (!getAmHosting()) return
    if (!udpState || !udpState.myClient) {
        console.warn('broadcastPushHostDataMaybe: UDP client not (yet) started')
        return
    }
    await fnGetProjects().then(async (projects) => {
        const activePeers = getMyActivePeers()
        const diskUsage = await getDiskUsage()
        const peerCount = Object.keys(activePeers).length
        const clientCount = Object.values(activePeers).filter(peer => peer.isClient).length
        const payload: PushHostInfoBroadcast = { port: getServerConfig().port, projects, peerCount, clientCount, diskUsage }
        sendMessage({
            type: 'push', id: MSG_PUSH_HOST_INFO,
            json: JSON.stringify(payload)
        })
    })
    return
}

// setup interval timer to determine expired host or host peers
export const hostUpdateIntervalMs = 1000 * 10 // 10 seconds
const peerExpirationMs = hostUpdateIntervalMs * 2.5 // 25 seconds (2.5x the host update interval)

let hostUpdateTimerRef: ReturnType<typeof setInterval> | undefined = undefined

export const startPushHostDataUpdating = (fnGetProjects: () => Promise<string[]>) => {
    if (hostUpdateTimerRef) return
    hostUpdateTimerRef = setInterval(() => {
        broadcastPushHostDataMaybe(fnGetProjects)
    }, hostUpdateIntervalMs)
}

let hostExpirationTimerRef: ReturnType<typeof setInterval> | undefined = undefined

export const startHostExpirationTimer = (intervalMs: number = 1000): void => {
    if (hostExpirationTimerRef) return
    hostExpirationTimerRef = setInterval(() => {
        pruneExpiredHosts()
    }, intervalMs)
}

export const pruneExpiredHosts = () => {
    const now = new Date().getTime()
    // prune my host peers first, then remove stale non-local hosts
    pruneMyExpiredPeers(now)
    for (const host of Object.values(serverState.hosts)) {
        const isMyHost = host.serverId === serverState.myServerId
        const shouldRemoveMyHost = isMyHost && !getAmHosting()
        const hostHeartbeatAt = host.lastSeenAt || host.updatedAt
        const isExpiredHost = !isMyHost && (!hostHeartbeatAt || now - new Date(hostHeartbeatAt).getTime() > peerExpirationMs)
        if (shouldRemoveMyHost || isExpiredHost) {
            console.log('Removing expired host: ', host.serverId)
            delete serverState.hosts[host.serverId]
        }
    }
}
