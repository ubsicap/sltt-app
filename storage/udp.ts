import dgram from 'dgram'
import { hostname } from 'os'
import { createUrl, getAmHosting, HostInfo, PeerInfo, serverState } from './serverState'
import { getServerConfig } from './serverConfig'
import { checkDiskUsage, DiskUsage } from './diskUsage'

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

let udpState: UdpState | undefined

type PushHostInfoBroadcast = {
    port: number,
    projects: string[],
    peers: { [serverId: string]: PeerInfo },
    diskUsage: DiskUsage | undefined,
}

type PushHostInfoResponse = {
    port: number,
    hostServerId: string,
    hostUpdatedAt: string,
    isClient: boolean,
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

const formatClientMsg = ({ type, id, json }: Omit<ClientMessage['message'], 'createdAt'>): Buffer => {
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
    return Buffer.from(JSON.stringify(payload))
}

export const sendMessage = ({ type, id, json }: Omit<ClientMessage['message'], 'createdAt'>, port = UDP_CLIENT_PORT, address = BROADCAST_ADDRESS): void => {
    if (!udpState || !udpState.myClient) throw new Error('UDP client not started')
    const msg = formatClientMsg({ type, id, json })
    udpState.myClient.send(msg, 0, msg.length, port, address, (err) => {
        if (err) console.error(err)
        else console.log(`Message sent to '${address}:${port}': ${id}`)
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
    if (!udpState) {
        return
    }
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
            const { port, projects, peers, diskUsage }: PushHostInfoBroadcast = JSON.parse(message.json)
            const hostServerId = client.serverId
            const hostUpdatedAt = message.createdAt
            if (hostServerId === serverState.myServerId || peers[serverState.myServerId] !== undefined) {
                // don't add other hosts until they have my peer info since that's used to determine if they are expired
                const protocol = 'http'
                const updatedHost: HostInfo = {
                    serverId: hostServerId,
                    protocol,
                    ip: rinfo.address,
                    port,
                    user: client.user,
                    startedAt: client.startedAt,
                    updatedAt: hostUpdatedAt,
                    computerName: client.computerName,
                    peers,
                    projects,
                    diskUsage,
                }
                serverState.hosts[client.serverId] = updatedHost
                serverState.hostProjects = new Set(projects)
                console.log(`Host URL is: ${createUrl(protocol, rinfo.address, port)}`)
                console.log('Host serverId:', updatedHost.serverId)
                console.log('Host computer name:', updatedHost.computerName)
                console.log('Host started at:', updatedHost.startedAt)
                console.log('Host projects:', projects)
                console.log('Host peers:', JSON.stringify(peers, null, 2))
            }
            // respond (as a peer) with our own local ip address and port information
            const payload: PushHostInfoResponse = {
                port: getServerConfig().port, hostServerId, hostUpdatedAt,
                isClient: serverState.proxyServerId === hostServerId,
            }
            sendMessage({
                type: 'response', id: MSG_PUSH_HOST_INFO,
                json: JSON.stringify(payload)
            }, rinfo.port, rinfo.address)
            return
        }
        if (message.type === 'response') {
            const { port, hostServerId, hostUpdatedAt, isClient }: PushHostInfoResponse = JSON.parse(message.json)
            // the host should store each peer's data
            const { startedAt, computerName, user } = client
            const host = serverState.hosts[hostServerId]
            const existingPeer = host.peers[client.serverId]
            const peerUpdatedAt = message.createdAt
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
            }
            host.peers[client.serverId] = updatedPeer
            console.log('Peers count: ', Object.keys(host.peers).length)
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
    const activePeers: { [serverId: string]: PeerInfo } = {}
    Object.values(myHost.peers).forEach((peer) => {
        if (peer.hostUpdatedAt === myHost.updatedAt) {
            activePeers[peer.serverId] = peer
        }
    })
    return activePeers
}

export const getDiskUsage = async (): Promise<DiskUsage | undefined> => {
    try {
        const startAt = new Date()
        console.debug('Checking disk usage...')
        const result = await checkDiskUsage(serverState.myLanStoragePath)
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
        const peers = activePeers
        const payload: PushHostInfoBroadcast = { port: getServerConfig().port, projects, peers, diskUsage }
        sendMessage({
            type: 'push', id: MSG_PUSH_HOST_INFO,
            json: JSON.stringify(payload)
        })
    })
    return
}

// setup interval timer to determine expired host or host peers
export const hostUpdateIntervalMs = 1000 * 10 // 10 seconds
const peerExpirationMs = hostUpdateIntervalMs * 2 // 20 seconds (2x the host update interval)

let hostUpdateTimerRef: ReturnType<typeof setInterval> | undefined = undefined

export const startPushHostDataUpdating = (fnGetProjects: () => Promise<string[]>) => {
    if (hostUpdateTimerRef) return
    hostUpdateTimerRef = setInterval(() => {
        broadcastPushHostDataMaybe(fnGetProjects)
    }, hostUpdateIntervalMs)
}

export const stopPushHostDataUpdating = (): void => {
    if (!hostUpdateTimerRef) return
    clearInterval(hostUpdateTimerRef)
    hostUpdateTimerRef = undefined
}

let hostExpirationTimerRef: ReturnType<typeof setInterval> | undefined = undefined

export const startHostExpirationTimer = (intervalMs: number = 1000): void => {
    if (hostExpirationTimerRef) return
    hostExpirationTimerRef = setInterval(() => {
        pruneExpiredHosts()
    }, intervalMs)
}

export const stopHostExpirationTimer = (): void => {
    if (!hostExpirationTimerRef) return
    clearInterval(hostExpirationTimerRef)
    hostExpirationTimerRef = undefined
}

export const stopUdpClient = async (): Promise<void> => {
    stopPushHostDataUpdating()
    stopHostExpirationTimer()
    if (!udpState || !udpState.myClient) {
        udpState = undefined
        return
    }
    const socket = udpState.myClient
    udpState.myClient = undefined
    await new Promise<void>((resolve) => {
        socket.close(() => {
            resolve()
        })
    })
    udpState = undefined
}

export const pruneExpiredHosts = () => {
    const now = new Date().getTime()
    // for each host, check if updatedAt is expired
    // instead of host.updatedAt, find my host peer updatedAt, since it uses my clock
    for (const host of Object.values(serverState.hosts)) {
        const isMyHost = host.serverId === serverState.myServerId
        const shouldRemoveMyHost = isMyHost && !getAmHosting()
        const myPeer = host.peers[serverState.myServerId]
        if (shouldRemoveMyHost || !isMyHost && (myPeer === undefined || myPeer.updatedAt && now - new Date(myPeer.updatedAt).getTime() > peerExpirationMs)) {
            console.log('Removing expired host: ', host.serverId)
            delete serverState.hosts[host.serverId]
        }
    }
}
