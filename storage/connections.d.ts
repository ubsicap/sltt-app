export const CONNECTIONS_API_SET_ALLOW_HOSTING = 'setAllowHosting'
export const CONNECTIONS_API_PROBE = 'probeConnections'
export const CONNECTIONS_API_CONNECT_TO_URL = 'connectToUrl'
// not sure if these belong to a different module or not
export const CONNECTIONS_API_ADD_STORAGE_PROJECT = 'addStorageProject'
export const CONNECTIONS_API_REMOVE_STORAGE_PROJECT = 'removeStorageProject'
export const CONNECTIONS_API_GET_STORAGE_PROJECTS = 'getStorageProjects'

export type SetAllowHostingArgs = { clientId: string, allowHosting: boolean, url: string }
export type SetAllowHostingResponse = { ok: true }

export type GetStorageProjectsArgs = { clientId: string }
export type GetStorageProjectsResponse = string[]

export type AddStorageProjectArgs = { clientId: string, project: string, adminEmail: string }
export type AddStorageProjectResponse = void

export type RemoveStorageProjectArgs = { clientId: string, project: string, adminEmail: string }
export type RemoveStorageProjectArgs = void

export type ConnectionInfo = {
    peers: number,
    computerName: string,
    user: string,
    projects: string[],
}

export type ProbeConnectionsArgs = { clientId: string, urls?: string[] }
export type ProbeConnectionsResponse = { url: string, accessible: boolean, connectionInfo: ConnectionInfo, networkName: string }[]

export type ConnectToUrlArgs = { clientId: string, url: string, project: string, username: string }
export type ConnectToUrlResponse = string
