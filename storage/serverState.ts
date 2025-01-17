
type ServerConfig = {
    port: number,
}

export const getServerConfig = (): ServerConfig => ({
    port: 45177
})

export const serverState = {
    hostingProjects: new Set(),
    hostUrl: '',
    myUrl: '',
    myPeers: new Set(),
}

export const getAmHosting = (): boolean => {
    const { myUrl, hostUrl } = serverState
    return myUrl && hostUrl && !hostUrl.startsWith(myUrl)
}

export const updateHostingProjects = (project: string, isHost: boolean): void => {
    if (!getAmHosting()) {
        // only update hosting projects if my server is hosting the storage server
        return
    }
    if (isHost) {
        serverState.hostingProjects.add(project)
    } else {
        serverState.hostingProjects.delete(project)
    }
    if (serverState.hostingProjects.size === 0) {
        serverState.hostUrl = ''
    }
}

export const getHostUrl = (): string => serverState.hostUrl