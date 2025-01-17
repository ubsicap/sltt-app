
export const CONNECTIONS_API_PROBE = 'probeConnections'
export const CONNECTIONS_API_CONNECT_TO_URL = 'connectToUrl'
// not sure if these belong to a different module or not
export const CONNECTIONS_API_ADD_STORAGE_PROJECT = 'addStorageProject'
export const CONNECTIONS_API_REMOVE_STORAGE_PROJECT = 'removeStorageProject'
export const CONNECTIONS_API_GET_STORAGE_PROJECTS = 'getStorageProjects'

export type GetStorageProjectsArgs = { clientId: string, url: string }
export type GetStorageProjectsResponse = string[]

export type AddStorageProjectArgs = { clientId: string, url: string, project: string, adminEmail: string, hostProject?: boolean }
export type AddStorageProjectResponse = void

export type RemoveStorageProjectArgs = { clientId: string, url: string, project: string, adminEmail: string }
export type RemoveStorageProjectArgs = void

export type ProbeConnectionsArgs = { clientId: string, urls?: string[] }
export type ProbeConnectionsResponse = { url: string, accessible: boolean }[]

export type ConnectToUrlArgs = { clientId: string, url: string, project: string }
export type ConnectToUrlResponse = string
