export const CONNECTIONS_API_START_UDP = 'startUdp'
export const CONNECTIONS_API_PROBE = 'probeConnections'
export const CONNECTIONS_API_CONNECT = 'connect'
// not sure if these belong to a different module or not
export const CONNECTIONS_API_ADD_STORAGE_PROJECT = 'addStorageProject'
export const CONNECTIONS_API_REMOVE_STORAGE_PROJECT = 'removeStorageProject'
export const CONNECTIONS_API_GET_STORAGE_PROJECTS = 'getStorageProjects'

export const MIN_DISK_SPACE_MB = 50

export type StartUdpArgs = { clientId: string }
export type StartUdpResponse = { ok: boolean }

export type GetStorageProjectsArgs = { clientId: string }
export type GetStorageProjectsResponse = string[]

export type AddStorageProjectArgs = { clientId: string, project: string, adminEmail: string }
export type AddStorageProjectResponse = { ok: boolean }

export type RemoveStorageProjectArgs = { clientId: string, project: string, adminEmail: string }
export type RemoveStorageProjectResponse = { ok: boolean }

type DiskUsage = { available: number, free: number, total: number }

export type ConnectionInfo = {
    serverId: string,
    canProxy: boolean,
    peers: number,
    clients: number,
    computerName: string,
    isMyServer: boolean,
    user: string,
    /** hosted projects */
    projects: string[],
    diskUsage: DiskUsage | undefined,
}

export type ProbeConnectionsArgs = { clientId: string, username: string }
export type ProbeConnectionsResponse = { connectionInfo: ConnectionInfo, accessible: boolean, networkName: string }[]

export type ConnectArgs = { clientId: string, serverId: string, project: string }
export type ConnectResponse = { connectionUrl: string }
