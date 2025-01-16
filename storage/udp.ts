import dgram from 'dgram'
import { hostname } from 'os'
import axios from 'axios'

const UDP_CLIENT_PORT = 41234

const CLIENT_MSG_SLTT_STORAGE_SERVER_URL = 'SLTT_STORAGE_SERVER_URL:'
const CLIENT_MSG_HELLO = 'Hello?'
const CLIENT_MSG_GET_SLTT_STORAGE_SERVER_URL = 'GET /storage-server/url'

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
    if (message === CLIENT_MSG_HELLO) {
        const responseHello = formatClientMsg('Hello')
        udpClient.send(responseHello, 0, responseHello.length, rinfo.port, rinfo.address, (err) => {
            if (err) console.error(err)
            else console.log('Response sent')
        })
        return
    }
    if (message === CLIENT_MSG_GET_SLTT_STORAGE_SERVER_URL) {

        const responseSlttStorageServerUrl = formatClientMsg(`${CLIENT_MSG_SLTT_STORAGE_SERVER_URL}${myLocalIpAddress}:${storageServerPort}`)
        udpClient.send(responseSlttStorageServerUrl, 0, responseSlttStorageServerUrl.length, rinfo.port, rinfo.address, (err) => {
            if (err) console.error(err)
            else console.log('Response sent')
        })
    }
    if (message.startsWith(CLIENT_MSG_SLTT_STORAGE_SERVER_URL)) {
        const [, ip, port] = message.split(':')
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
    }
})

type ClientMessage = {
    client: {
        startedAt: string,
        computerName: string,
    },
    message: string,
}

const formatClientMsg = (msg: string): Buffer => {
    const payload: ClientMessage = {
        client: { startedAt, computerName: myComputerName },
        message: msg,
    }
    return Buffer.from(JSON.stringify(payload))
}

udpClient.on('listening', () => {
    const address = udpClient.address()
    console.log(`Client listening on ${address.address}:${address.port}`)
    const msgHello = formatClientMsg(CLIENT_MSG_HELLO)
    udpClient.setBroadcast(true)
    udpClient.send(msgHello, 0, msgHello.length, UDP_CLIENT_PORT, '255.255.255.255', (err) => {
        if (err) console.error(err)
        else console.log('Broadcast message sent')
    })
})

udpClient.bind(UDP_CLIENT_PORT)

let storageServerPort = NaN

export const setupUDPServer = (port: number): void => {
    storageServerPort = port
    const msgGetStorageServerUrl = formatClientMsg(CLIENT_MSG_GET_SLTT_STORAGE_SERVER_URL)
    udpClient.send(msgGetStorageServerUrl, 0, msgGetStorageServerUrl.length, UDP_CLIENT_PORT, '255.255.255.255', (err) => {
        if (err) console.error(err)
        else console.log('Broadcast message sent')
    })
}
