import { normalize } from 'path'

type ServerInfo = {
    serverId: string,
    startedAt: string,
    updatedAt: string,
    computerName: string,
    user: string,
    protocol: string,
    ip: string,
    port: number,
}

export type HostInfo = ServerInfo & {
    projects: string[],
    peers: { [serverId: string]: PeerInfo },
    diskUsage: { available: number, free: number, total: number } | undefined,
}

export type PeerInfo = ServerInfo & {
    /** (host-generated timestamp) when the peer's host was updated */
    hostUpdatedAt: string,
    /** (host-generated timestamp) when the peer was added to host peers */
    hostPeersAt: string,
    /** (peer-generated timestamp) when peer sent response to host */
    updatedAt: string,
}

export const createUrl = (protocol: string, ip: string, port: number): string => {
    return `${protocol}://${ip}:${port}`
}

const hosts: { [serverId: string]: HostInfo } = {}

export type ServerSettings = {
    allowHosting: boolean,
    myLanStoragePath: string,
    myServerId: string,
}

export const initialServerConfig: ServerSettings = {
    allowHosting: false,
    myLanStoragePath: '',
    myServerId: '',
}

export const serverState = {
    hostProjects: new Set<string>(),
    hosts,
    proxyUrl: '',
    myUrl: '',
    myUsername: '',
    ...initialServerConfig
}

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

export const SLTT_APP_LAN_FOLDER = `sltt-app/lan`

export const checkHostStoragePath = (hostStoragePath: string, checkEndConvention = true): void => {
    if (!hostStoragePath) {
        throw new Error('Host storage path is empty')
    }
    if (hostStoragePath.startsWith('file:')) {
        throw new Error(`Host storage path must be a local disk path, but got '${hostStoragePath}'`)
    }
    if (hostStoragePath.startsWith('http')) {
        throw new Error(`Using proxy server? Expected LAN disk storage path, but got '${hostStoragePath}'`)
    }
    if (checkEndConvention && !normalize(hostStoragePath).endsWith(`${normalize(SLTT_APP_LAN_FOLDER)}`)) {
        throw new Error(`Host storage path should end with: "${normalize(SLTT_APP_LAN_FOLDER)}"`)
    }
}

export const setLANStoragePath = (path: string): void => {
    const lanStoragePath = serverState.myLanStoragePath
    if (path === lanStoragePath) return
    checkHostStoragePath(path)
    serverState.myLanStoragePath = path
    console.log(`lanStoragePath: ${serverState.myLanStoragePath}`, )
}

export const setProxyUrl = (url: string): void => {
    if (!url.startsWith('http')) {
        throw new Error(`Invalid proxy url: ${url}`)
    }
    serverState.proxyUrl = url
}

/** true when allowHosting and myLanStoragePath are truthy */
export const getAmHosting = (): boolean => {
    const { allowHosting, myLanStoragePath } = serverState
    return allowHosting && !!myLanStoragePath
}

const sortHostsByRelevance = (a: HostInfo, b: HostInfo): number => {
    const { myServerId } = serverState
    if (getAmHosting()) {
        if (a.serverId === myServerId) return -1
        if (b.serverId === myServerId) return 1
    }
    // look for myself in host peers and sort by earlier updatedAt
    const aPeer = a.peers[myServerId]
    const bPeer = b.peers[myServerId]
    if (aPeer && bPeer) {
        return aPeer.hostPeersAt < bPeer.hostPeersAt ? -1 : 1
    }
    if (aPeer) return -1
    if (bPeer) return 1
    return 0
}

export const getHostsByRelavance = (): HostInfo[] => Object.values(
    serverState.hosts
).sort(sortHostsByRelevance)
