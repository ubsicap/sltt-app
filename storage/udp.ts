import dgram from 'dgram'
import { hostname } from 'os'
import axios from 'axios'
import { getAmHosting, getServerConfig, serverState } from './serverState'

const UDP_CLIENT_PORT = 41234

const MSG_HELLO = 'Hello?'
const MSG_GET_HOST = 'GET /storage-server/host'
const MSG_GET_PEERS = 'GET /storage-server/peers'
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
        if (!myLocalIpAddress) {
            myLocalIpAddress = rinfo.address
            console.log('My local IP address:', myLocalIpAddress)
        }
        if (message.type === 'request' && message.id === MSG_HELLO) {
            sendMessage({ type: 'response', id: 'Hello' }, rinfo.port, rinfo.address)
            return
        }
        console.log('Ignoring own message:', JSON.stringify(clientData.message, null, 2))
        return
    }
    console.log(`Client got: "${msg}" from '${rinfo.address}:${rinfo.port}'`)
    if (message.id === MSG_GET_HOST && getAmHosting()) {
        if (message.type === 'request') {
            const projects = Array.from(serverState.hostProjects)
            sendMessage({
                type: 'response', id: MSG_GET_HOST,
                json: JSON.stringify({
                    ip: myLocalIpAddress, port: getServerConfig().port, projects
                })
            }, rinfo.port, rinfo.address)
            return
        }
        if (message.type === 'response' && (!serverState.hostStartedAt || client.startedAt <= serverState.hostStartedAt)) {
            const { ip, port, projects } = JSON.parse(message.json)
            serverState.hostUrl = `http://${ip}:${port}`
            serverState.hostProjects = new Set(projects)
            serverState.hostComputerName = client.computerName
            serverState.hostStartedAt = client.startedAt
            console.log(`Set storage server to '${serverState.hostUrl}'`)
            console.log('Host computer name:', serverState.hostComputerName)
            console.log('Hosting projects:', projects)
            console.log('Host started at:', serverState.hostStartedAt)
            return
        }
    }
    if (message.id === MSG_GET_PEERS) {
        if (message.type === 'request') {
            sendMessage({
                type: 'response', id: MSG_GET_PEERS,
                json: JSON.stringify({
                    ip: myLocalIpAddress, port: getServerConfig().port
                })
            }, rinfo.port, rinfo.address)
            return
        }
        if (message.type === 'response') {
            const { ip, port } = JSON.parse(message.json)
            serverState.myPeers.add(`http://${ip}:${port}?clientId=${client.computerName}&startedAt=${client.startedAt}`)
            console.log('Peers count: ', serverState.myPeers.size)
            return
        }
        return
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
    },
    message: {
        type: 'request'|'response'|'notify',
        id: string,
        json?: string,
    }
}

const formatClientMsg = ({ type, id, json }: ClientMessage['message']): Buffer => {
    const payload: ClientMessage = {
        client: { startedAt, computerName: myComputerName },
        message: {
            type,
            id,
            json,
        },
    }
    return Buffer.from(JSON.stringify(payload))
}

const BROADCAST_ADDRESS = '255.255.255.255'

const sendMessage = ({ type, id, json }: ClientMessage['message'], port = UDP_CLIENT_PORT, address = BROADCAST_ADDRESS): void => {
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
    sendMessage({ type: 'request', id: MSG_HELLO })
})

myClient.bind(UDP_CLIENT_PORT)

export const broadcastGetHostMessage = (): void => {
    sendMessage({ type: 'request', id: MSG_GET_HOST })
}

export const broadcastGetPeerstMessage = (): void => {
    sendMessage({ type: 'request', id: MSG_GET_PEERS })
}
