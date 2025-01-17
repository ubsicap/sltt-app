
type ServerConfig = {
    port: number,
}

export const getServerConfig = (): ServerConfig => ({
    port: 45177
})

export const serverState = {
    hostProjects: new Set(),
    hostUrl: '',
    hostComputerName: '',
    hostStartedAt: '',
    myUrl: '',
    myPeers: new Set(),
}

export const getAmHosting = (): boolean => {
    const { myUrl, hostUrl } = serverState
    const result = Boolean(myUrl && hostUrl && hostUrl.startsWith(myUrl))
    return result
}

export const updateHostProjects = (project: string, hostProject: boolean): void => {
    if (!getAmHosting()) {
        // only update hosting projects if my server is hosting the storage server
        return
    }
    if (hostProject) {
        serverState.hostProjects.add(project)
    } else {
        serverState.hostProjects.delete(project)
    }
    if (serverState.hostProjects.size === 0) {
        serverState.hostUrl = ''
    }
}

export const getHostUrl = (): string => serverState.hostUrl