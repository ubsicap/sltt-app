import dgram from 'dgram'
import { hostname } from 'os'
import axios from 'axios'
import { getServerConfig, serverState } from './serverState'

const UDP_CLIENT_PORT = 41234

const MSG_DISCOVER_MY_LOCAL_IP_ADDRESS = 'GET /my-local-address'
const MSG_PUSH_HOST_DATA = 'PUSH /storage-server/host'
const MSG_SLTT_STORAGE_SERVER_URL = 'SLTT_STORAGE_SERVER_URL'

// unlikely that two clients on the same networ will start at the same time
const startedAt = new Date().toISOString()
const myComputerName = hostname()
console.log('My computer name:', myComputerName)
console.log('UDP started at:', startedAt)
let myLocalIpAddress = ''

const myClient = dgram.createSocket('udp4')

myClient.on('message', async (msg, rinfo) => {
    const clientData: ClientMessage = JSON.parse(msg.toString())
    const { message, client } = clientData
    if (client.computerName === myComputerName && 
        client.startedAt === startedAt
    ) {
        if (myLocalIpAddress !== rinfo.address) {
            myLocalIpAddress = rinfo.address
            console.log('My local IP address:', myLocalIpAddress)
        }
        if (message.type === 'request' && message.id === MSG_DISCOVER_MY_LOCAL_IP_ADDRESS) {
            sendMessage({ type: 'response', id: MSG_DISCOVER_MY_LOCAL_IP_ADDRESS }, rinfo.port, rinfo.address)
            return
        }
        console.log('Ignoring own message:', JSON.stringify(clientData.message, null, 2))
        return
    }
    console.log(`Client got: "${msg}" from '${rinfo.address}:${rinfo.port}'`)
    if (message.id === MSG_PUSH_HOST_DATA) {
        const { ip, port, projects, peers } = JSON.parse(message.json)
        const hostUrl = `http://${ip}:${port}`
        if (message.type === 'push' && (hostUrl === serverState.hostUrl || !serverState.host.startedAt || client.startedAt <= serverState.host.startedAt)) {
            serverState.hostProjects = new Set(projects)
            serverState.host.ip = ip
            serverState.host.port = port
            serverState.host.user = client.user
            serverState.host.startedAt = client.startedAt
            serverState.host.updatedAt = message.createdAt
            serverState.host.computerName = client.computerName
            serverState.hostPeers = peers
            console.log(`Set storage server to '${serverState.hostUrl}'`)
            console.log('Host computer name:', serverState.host.computerName)
            console.log('Host started at:', serverState.host.startedAt)
            console.log('Host projects:', projects)
            console.log('Host peers:', JSON.stringify(peers, null, 2))
            // respond (as a peer) with our own local ip address and port information
            sendMessage({
                type: 'response', id: MSG_PUSH_HOST_DATA,
                json: JSON.stringify({
                    ip: myLocalIpAddress, port: getServerConfig().port
                })
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
                ip, port,
            }
            // TODO: remove peers that haven't been updated in a while
            console.log('Peers count: ', serverState.hostPeers.size)
        }
    }
    if (message.type === 'response' && message.id === MSG_SLTT_STORAGE_SERVER_URL) {
        const { ip, port } = JSON.parse(message.json)
        const serverUrl = `http://${ip}:${port}`
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
    sendMessage({ type: 'request', id: MSG_DISCOVER_MY_LOCAL_IP_ADDRESS })
})

myClient.bind(UDP_CLIENT_PORT)

export const broadcastPushHostDataMaybe = (): void => {
    if (serverState.myProjectsToHost.size === 0) return
    const projects = Array.from(serverState.myProjectsToHost)
    const peers = serverState.hostPeers
    sendMessage({
        type: 'push', id: MSG_PUSH_HOST_DATA,
        json: JSON.stringify({
            ip: myLocalIpAddress, port: getServerConfig().port, projects, peers
        })
    })
    return
}
