import dgram from 'dgram'
import { hostname } from 'os'
import axios from 'axios'
import { serverState } from './serverState'

const UDP_CLIENT_PORT = 41234

const CLIENT_MSG_SLTT_STORAGE_SERVER_URL = 'SLTT_STORAGE_SERVER_URL'
const CLIENT_MSG_HELLO = 'Hello?'
const CLIENT_MSG_GET_HOST_ADDRESS = 'GET /storage-server/host/address'

// unlikely that two clients on the same networ will start at the same time
const startedAt = new Date().toISOString()
const myComputerName = hostname()
let myLocalIpAddress = ''

const udpClient = dgram.createSocket('udp4')

udpClient.on('message', async (msg, rinfo) => {
    const clientData: ClientMessage = JSON.parse(msg.toString())
    if (clientData.client.computerName === myComputerName && 
        clientData.client.startedAt === startedAt
    ) {
        if (!myLocalIpAddress) {
            myLocalIpAddress = rinfo.address
            console.log('My local IP address:', myLocalIpAddress)
        }
        console.log('Ignoring own message:', JSON.stringify(clientData, null, 2))
        return
    }
    console.log(`Client got: "${msg}" from '${rinfo.address}:${rinfo.port}'`)
    const { message } = clientData
    if (message.type === 'request' && message.id === CLIENT_MSG_HELLO) {
        const responseHello = formatClientMsg({ type: 'response', id: 'Hello' })
        udpClient.send(responseHello, 0, responseHello.length, rinfo.port, rinfo.address, (err) => {
            if (err) console.error(err)
            else console.log('Response sent')
        })
        return
    }
    if (message.id === CLIENT_MSG_GET_HOST_ADDRESS && serverState.hostingProjects.size > 0) {
        if (message.type === 'request') {
            const responseSlttStorageServerUrl = formatClientMsg({ 
                type: 'response', id: CLIENT_MSG_GET_HOST_ADDRESS,
                json: JSON.stringify({ ip: myLocalIpAddress, port: 45177 }) 
            })
            udpClient.send(responseSlttStorageServerUrl, 0, responseSlttStorageServerUrl.length, rinfo.port, rinfo.address, (err) => {
                if (err) console.error(err)
                else console.log('Response sent')
            })
            return
        }
        if (message.type === 'response') {
            const { ip, port } = JSON.parse(message.json)
            serverState.hostUrl = `http://${ip}:${port}`
            return
        }
    }
    if (message.type === 'response' && message.id === CLIENT_MSG_SLTT_STORAGE_SERVER_URL) {
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

udpClient.on('listening', () => {
    const address = udpClient.address()
    console.log(`Client listening on ${address.address}:${address.port}`)
    const msgHello = formatClientMsg({ type: 'request', id: CLIENT_MSG_HELLO })
    udpClient.setBroadcast(true)
    udpClient.send(msgHello, 0, msgHello.length, UDP_CLIENT_PORT, '255.255.255.255', (err) => {
        if (err) console.error(err)
        else console.log('Broadcast message sent')
    })
})

udpClient.bind(UDP_CLIENT_PORT)

export const broadcastGetHostMessage = (): void => {
    const msgGetStorageServerUrl = formatClientMsg({ type: 'request', id: CLIENT_MSG_GET_HOST_ADDRESS })
    udpClient.send(msgGetStorageServerUrl, 0, msgGetStorageServerUrl.length, UDP_CLIENT_PORT, '255.255.255.255', (err) => {
        if (err) console.error(err)
        else console.log('Broadcast message sent')
    })
}
