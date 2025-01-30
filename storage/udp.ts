import dgram from 'dgram'
import { hostname } from 'os'
import axios from 'axios'
import { createUrl, getServerConfig, initialHost, serverState } from './serverState'

const UDP_CLIENT_PORT = 41234

const MSG_DISCOVER_MY_UDP_IP_ADDRESS = 'GET /my-udp-ipaddress'
const MSG_PUSH_HOST_DATA = 'PUSH /storage-server/host'
const MSG_SLTT_STORAGE_SERVER_URL = 'SLTT_STORAGE_SERVER_URL'

// unlikely that two clients on the same network will start at the same time
const startedAt = new Date().toISOString()
const myComputerName = hostname()
console.log('My computer name:', myComputerName)
console.log('UDP started at:', startedAt)
let myUdpIpAddress = ''

const myClient = dgram.createSocket('udp4')

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
        const { port, projects, peers } = JSON.parse(message.json)
        // TODO: replace host detection based on clientId that is persisted on each computer
        if (message.type === 'push' && (!serverState.host.startedAt || client.startedAt <= serverState.host.startedAt)) {
            serverState.hostProjects = new Set(projects)
            serverState.host.ip = rinfo.address
            serverState.host.port = port
            serverState.host.user = client.user
            serverState.host.startedAt = client.startedAt
            serverState.host.updatedAt = message.createdAt
            serverState.host.computerName = client.computerName
            serverState.hostPeers = peers
            console.log(`Set storage server hostUrl to '${JSON.stringify(serverState.hostUrl)}'`)
            console.log('Host computer name:', serverState.host.computerName)
            console.log('Host started at:', serverState.host.startedAt)
            console.log('Host projects:', projects)
            console.log('Host peers:', JSON.stringify(peers, null, 2))
            // respond (as a peer) with our own local ip address and port information
            sendMessage({
                type: 'response', id: MSG_PUSH_HOST_DATA,
                json: JSON.stringify({ port: getServerConfig().port })
            }, rinfo.port, rinfo.address)
            return
        }
        if (message.type === 'response') {
            // the host should store each peer's data
            const { startedAt, computerName, user } = client
            serverState.hostPeers[client.startedAt] = {
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
        client: { startedAt, computerName: myComputerName, user: serverState.myUsername },
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

export const broadcastPushHostDataMaybe = (fnGetProjects: () => Promise<string[]>): void => {
    if (!serverState.allowHosting) return
    fnGetProjects().then((projects) => {
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
    if (serverState.allowHosting && now - new Date(serverState.host.updatedAt).getTime() > hostUpdateIntervalMs) {
        broadcastPushHostDataMaybe(() => Promise.resolve(Array.from(serverState.hostProjects)))
    }

    if (serverState.host.updatedAt && now - new Date(serverState.host.updatedAt).getTime() > peerExpirationMs) {
        console.log('Removing expired host')
        serverState.host = { ...initialHost}
        serverState.hostProjects = new Set()
        serverState.hostPeers = {}
        return
    }
    const expiredPeers = Object.keys(serverState.hostPeers).filter((startedAt) => {
        const peer = serverState.hostPeers[startedAt]
        const updatedAt = new Date(peer.updatedAt).getTime()
        return now - updatedAt > peerExpirationMs
    })
    expiredPeers.forEach((startedAt) => {
        console.log(`Removing expired peer: ${startedAt}`)
        delete serverState.hostPeers[startedAt]
    })
}, 1000)
