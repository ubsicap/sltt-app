
type ServerConfig = {
    port: number,
}

export const getServerConfig = (): ServerConfig => ({
    port: 45177
})

export const serverState = {
    hostingProjects: new Set(),
    hostUrl: '',
}

export const updateHostingProjects = (project: string, isHost: boolean): void => {
    if (isHost) {
        serverState.hostingProjects.add(project)
    } else {
        serverState.hostingProjects.delete(project)
    }
}

export const getHostUrl = (): string => serverState.hostUrl