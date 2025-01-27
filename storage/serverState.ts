
type ServerConfig = {
    port: number,
}

export const getServerConfig = (): ServerConfig => ({
    port: 45177
})

type PeerData = {
    startedAt: string,
    updatedAt: string,
    computerName: string,
    user: string,
    ipv4s: Ipv4Details[],
    port: number,
}

export const createUrl = (ip: string, port: number): string => {
    return `http://${ip}:${port}`
}


const host: PeerData = {
    startedAt: '',
    updatedAt: '',
    computerName: '',
    user: '',
    ipv4s: [],
    port: -1,
}

const hostPeers: { [clientId: string]: PeerData } = {}

export const serverState = {
    hostProjects: new Set(),
    host,
    get hostUrls(): string[] {
        const hostUrls = host.ipv4s.map(ipv4 => createUrl(ipv4.address, host.port))
        return hostUrls
    },

    /** proxyUrl will be hostUrl whenever CONNECTIONS_API_CONNECT_TO_URL is called with http url */
    hostPeers,
    proxyUrl: '',
    myUrl: '',
    allowHosting: false,
    myProjectsToHost: new Set(),
    myUsername: '',
    myLanStoragePath: '',
}

export type Ipv4Details = { name: string, address: string }

export const getLANStoragePath = (): string => {
    const lanStoragePath = serverState.myLanStoragePath
    if (lanStoragePath === '') {
        throw new Error('LAN storage path is not set')
    }
    if (lanStoragePath.startsWith('http')) {
        throw new Error(`Using proxy server? Expected LAN disk storage path, but got '${lanStoragePath}'`)
    }
    return lanStoragePath
}

export const setLANStoragePath = (path: string): void => {
    const lanStoragePath = serverState.myLanStoragePath
    if (path === lanStoragePath) return
    if (path.startsWith('file:')) {
        throw new Error(`LAN storage path must be a local disk path, but got '${path}'`)
    }
    if (path.startsWith('http')) {
        throw new Error(`Using proxy server? Expected LAN disk storage path, but got '${lanStoragePath}'`)
    }
    serverState.myLanStoragePath = path
    console.log(`lanStoragePath: ${serverState.myLanStoragePath}`, )
}

export const setProxyUrl = (url: string): void => {
    if (!url.startsWith('http')) {
        throw new Error(`Invalid proxy url: ${url}`)
    }
    if (serverState.hostUrls.some(hostUrl => hostUrl === url)) {
        throw new Error(`Proxy url (${url}) must exist in host urls: ${JSON.stringify(serverState.host.ipv4s)}`)
    }
    serverState.proxyUrl = url
}

export const getAmHosting = (): boolean => {
    const { myUrl, hostUrls } = serverState
    const result = Boolean(myUrl && hostUrls.length > 0 && hostUrls.some(hostUrl => hostUrl.startsWith(myUrl)))
    return result
}

/** TODO: use handleGetStorageProjects instead? */
export const updateMyProjectsToHost = (projects: string[]): void => {
    const { myProjectsToHost } = serverState
    myProjectsToHost.clear()
    projects.forEach(project => myProjectsToHost.add(project))
}

export const getHostUrls = (): string[] => serverState.hostUrls
