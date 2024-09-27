
export const CONNECTIONS_API_PROBE = 'probeConnections'
export const CONNECTIONS_API_CONNECT_TO_URL = 'connectToUrl'

export type ProbeConnectionsArgs = { clientId: string, urls?: string[] }
export type ProbeConnectionsResponse = { url: string, accessible: boolean }[]

export type ConnectToUrlArgs = { clientId: string, url: string }
export type ConnectToUrlResponse = string
