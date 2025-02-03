import dgram from 'dgram'
import { hostname } from 'os'
import axios from 'axios'
import { createUrl, initialHost, PeerData, serverState } from './serverState'
import { getServerConfig } from './serverConfig'

const UDP_CLIENT_PORT = 41234

const MSG_DISCOVER_MY_UDP_IP_ADDRESS = 'GET /my-udp-ipaddress'
const MSG_PUSH_HOST_DATA = 'PUSH /storage-server/host'
const MSG_SLTT_STORAGE_SERVER_URL = 'SLTT_STORAGE_SERVER_URL'

/** unlikely that two clients on the same network will start at the same time */
const startedAt = new Date().toISOString()
const myComputerName = hostname()
console.log('My computer name:', myComputerName)
console.log('UDP started at:', startedAt)
let myUdpIpAddress = ''

const myClient = dgram.createSocket('udp4')

const findEarliestFirstResponseToHost = (peers: PeerData[]): string => {
    let earliestFirstResponseToHost = ''
    peers.forEach(peer => {
        if (Date.now() - new Date(peer.updatedAt).getTime() > peerExpirationMs) {
            // skip expired peers
            return
        }
        if (!earliestFirstResponseToHost) {
            earliestFirstResponseToHost = peer.firstResponseToHostAt
        } else if (peer.firstResponseToHostAt < earliestFirstResponseToHost) {
            earliestFirstResponseToHost = peer.firstResponseToHostAt
        }
    })
    return earliestFirstResponseToHost
}

myClient.on('message', async (msg, rinfo) => {
    const clientData: ClientMessage = JSON.parse(msg.toString())
    const { message, client } = clientData
    if (client.computerName === myComputerName && 
        client.startedAt === startedAt && message.id !== MSG_PUSH_HOST_DATA
    ) {
        if (myUdpIpAddress !== rinfo.address) {
            myUdpIpAddress = rinfo.address
            console.log('My UDP IP address:', myUdpIpAddress)
        }
        if (message.type === 'request' && message.id === MSG_DISCOVER_MY_UDP_IP_ADDRESS) {
            sendMessage({ type: 'response', id: MSG_DISCOVER_MY_UDP_IP_ADDRESS }, rinfo.port, rinfo.address)
            return
        }
        console.log('Ignoring own message:', JSON.stringify(clientData.message, null, 2))
        return
    }
    console.log(`Client received message from '${rinfo.address}:${rinfo.port}': "${msg}`)
    if (message.id === MSG_PUSH_HOST_DATA) {
        if (message.type === 'push') {
            const { port, projects, peers }: { port: number, projects: string[], peers: { [serverId: string]: PeerData }} = JSON.parse(message.json)
            const messagePeersEarliestResponseToHost = findEarliestFirstResponseToHost(Object.values(peers))
            const serverStateEarliestResponseToHost = findEarliestFirstResponseToHost(Object.values(serverState.hostPeers))
            if ((!serverStateEarliestResponseToHost || messagePeersEarliestResponseToHost && (messagePeersEarliestResponseToHost <= serverStateEarliestResponseToHost))) {
                serverState.hostProjects = new Set(projects)
                serverState.host.serverId = client.serverId
                serverState.host.ip = rinfo.address
                serverState.host.port = port
                serverState.host.user = client.user
                serverState.host.startedAt = client.startedAt
                serverState.host.updatedAt = message.createdAt
                serverState.host.computerName = client.computerName
                serverState.hostPeers = peers
                console.log(`Set storage server hostUrl to '${serverState.hostUrl}'`)
                console.log('Host serverId:', serverState.host.serverId)
                console.log('Host computer name:', serverState.host.computerName)
                console.log('Host started at:', serverState.host.startedAt)
                console.log('Host projects:', projects)
                console.log('Host peers:', JSON.stringify(peers, null, 2))
                // respond (as a peer) with our own local ip address and port information
                sendMessage({
                    type: 'response', id: MSG_PUSH_HOST_DATA,
                    json: JSON.stringify({ port: getServerConfig().port })
                }, rinfo.port, rinfo.address)
            }
            return
        }
        if (message.type === 'response') {
            const { port }: { port: number } = JSON.parse(message.json)
            // the host should store each peer's data
            const { startedAt, computerName, user } = client
            const existingPeer = serverState.hostPeers[client.serverId]
            const firstResponseToHostAt = existingPeer ? existingPeer.firstResponseToHostAt : message.createdAt
            serverState.hostPeers[client.serverId] = {
                serverId: client.serverId,
                firstResponseToHostAt,
                startedAt,
                updatedAt: message.createdAt,
                computerName,
                user,
                ip: rinfo.address,
                port,
            }
            // TODO: remove peers that haven't been updated in a while
            console.log('Peers count: ', Object.keys(serverState.hostPeers).length)
        }
    }
    if (message.type === 'response' && message.id === MSG_SLTT_STORAGE_SERVER_URL) {
        const { ip, port } = JSON.parse(message.json)
        const serverUrl = createUrl(ip, port)
        console.log(`Discovered storage server at ${serverUrl}`)
        try {
            const response = await axios.get(`${serverUrl}/status`, {
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            console.log('Response from storage server:', response.data);
        } catch (error) {
            console.error('Error connecting to storage server:', error);
        }
        return
    }
})

type ClientMessage = {
    client: {
        serverId: string,
        startedAt: string,
        computerName: string,
        user: string,
    },
    message: {
        createdAt: string,
        type: 'request'|'response'|'push',
        id: string,
        json?: string,
    }
}

const formatClientMsg = ({ type, id, json }: Omit<ClientMessage['message'], 'createdAt'>): Buffer => {
    const payload: ClientMessage = {
        client: { serverId: serverState.myServerId, startedAt, computerName: myComputerName, user: serverState.myUsername },
        message: {
            createdAt: new Date().toISOString(),
            type,
            id,
            json,
        },
    }
    return Buffer.from(JSON.stringify(payload))
}

const BROADCAST_ADDRESS = '255.255.255.255'

const sendMessage = ({ type, id, json }: Omit<ClientMessage['message'], 'createdAt'>, port = UDP_CLIENT_PORT, address = BROADCAST_ADDRESS): void => {
    const msg = formatClientMsg({ type, id, json })
    myClient.send(msg, 0, msg.length, port, address, (err) => {
        if (err) console.error(err)
        else console.log(`Message sent to '${address}:${port}': ${id}`)
    })
}

myClient.on('listening', () => {
    const address = myClient.address()
    console.log(`Client listening on ${address.address}:${address.port}`)
    myClient.setBroadcast(true)
    sendMessage({ type: 'request', id: MSG_DISCOVER_MY_UDP_IP_ADDRESS })
})

myClient.bind(UDP_CLIENT_PORT)

const removeMyExpiredHostPeers = (): void => {
    if (!serverState.allowHosting) return
    // compare host.updatedAt to each peer's updatedAt
    // to approximate the clock difference for each peer
    // then use each clock difference to help determine
    // if peerExperirationMs applies
    const myHostUpdatedAt = new Date(serverState.host.updatedAt).getTime()
    const expiredPeers = Object.keys(serverState.hostPeers).filter((startedAt) => {
        const peer = serverState.hostPeers[startedAt]
        const peerUpdatedAt = new Date(peer.updatedAt).getTime()
        const clockDifference = myHostUpdatedAt - peerUpdatedAt
        const updatedAt = peerUpdatedAt + clockDifference
        return Date.now() - updatedAt > peerExpirationMs
    })
    expiredPeers.forEach((serverId) => {
        console.log(`Removing expired peer: ${serverId}`)
        delete serverState.hostPeers[serverId]
    })
}

export const broadcastPushHostDataMaybe = (fnGetProjects: () => Promise<string[]>): void => {
    if (!serverState.allowHosting) return
    fnGetProjects().then((projects) => {
        removeMyExpiredHostPeers()
        const peers = serverState.hostPeers
        sendMessage({
            type: 'push', id: MSG_PUSH_HOST_DATA,
            json: JSON.stringify({
                port: getServerConfig().port, projects, peers
            })
        })
    })
    return
}

// setup interval timer to determine expired host or host peers
export const hostUpdateIntervalMs = 1000 * 10 // 10 seconds
const peerExpirationMs = hostUpdateIntervalMs * 2 // 20 seconds (2x the host update interval)

setInterval(() => {
    const now = new Date().getTime()
    // instead of host.updatedAt, find my host peer updatedAt, since it uses my clock
    const myPeer = serverState.hostPeers[serverState.myServerId]
    if (myPeer && myPeer.updatedAt && now - new Date(myPeer.updatedAt).getTime() > peerExpirationMs) {
        console.log('Removing expired host')
        serverState.host = { ...initialHost}
        serverState.hostProjects = new Set()
        serverState.hostPeers = {}
        return
    }
}, 1000)
