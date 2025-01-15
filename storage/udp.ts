import dgram from 'dgram'
import os from 'os'
import axios from 'axios'

const UDP_SERVER_PORT = 41234
const UDP_CLIENT_PORT = 41235

const SERVER_MSG_SLTT_STORAGE_SERVER_URL = 'SLTT_STORAGE_SERVER_URL:'
const CLIENT_MSG_HELLO = 'Hello?'
const CLIENT_MSG_GET_SLTT_STORAGE_SERVER_URL = 'GET /storage-server/url'

// Function to get the local IP address
const getLocalIPAddress = (): string => {
    const interfaces = os.networkInterfaces()
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]!) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address
            }
        }
    }
    return '127.0.0.1'
}

const udpServer = dgram.createSocket('udp4')

udpServer.on('listening', () => {
    const address = udpServer.address()
    console.log(`Server listening on ${address.address}:${address.port}`)
})

udpServer.on('message', (msg, rinfo) => {
    console.log(`Server got: ${msg} from ${rinfo.address}:${rinfo.port}`)
    if (msg.toString() === CLIENT_MSG_HELLO) {
        const response = Buffer.from('Hello from server')
        udpServer.send(response, 0, response.length, rinfo.port, rinfo.address, (err) => {
            if (err) console.error(err)
            else console.log('Response sent')
        })
    }
    if (msg.toString() === CLIENT_MSG_GET_SLTT_STORAGE_SERVER_URL) {
        const response = Buffer.from(`${SERVER_MSG_SLTT_STORAGE_SERVER_URL}${getLocalIPAddress()}:${storageServerPort}`)
        udpServer.send(response, 0, response.length, rinfo.port, rinfo.address, (err) => {
            if (err) console.error(err)
            else console.log('Response sent')
        })
    }
})

udpServer.bind(UDP_SERVER_PORT)

const udpClient = dgram.createSocket('udp4')

udpClient.on('message', async (msg, rinfo) => {
    console.log(`Client got: ${msg} from ${rinfo.address}:${rinfo.port}`)
    const message = msg.toString()
    if (message.startsWith(SERVER_MSG_SLTT_STORAGE_SERVER_URL)) {
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

udpClient.on('listening', () => {
    const address = udpClient.address()
    console.log(`Client listening on ${address.address}:${address.port}`)
    const message = Buffer.from(CLIENT_MSG_HELLO)
    udpClient.setBroadcast(true)
    udpClient.send(message, 0, message.length, UDP_SERVER_PORT, '255.255.255.255', (err) => {
        if (err) console.error(err)
        else console.log('Broadcast message sent')
    })
})

udpClient.bind(UDP_CLIENT_PORT)

let storageServerPort = NaN

export const setupUDPServer = (port: number): void => {
    storageServerPort = port
    const message = Buffer.from(CLIENT_MSG_GET_SLTT_STORAGE_SERVER_URL)
    udpClient.send(message, 0, message.length, UDP_SERVER_PORT, '255.255.255.255', (err) => {
        if (err) console.error(err)
        else console.log('Broadcast message sent')
    })
}
