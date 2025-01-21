import { describe, it, expect, beforeEach } from 'vitest'
import { serverState, updateMyProjectsToHost, getAmHosting } from './serverState'

describe('getAmHosting', () => {
    beforeEach(() => {
        // Reset serverState before each test
        serverState.hostProjects.clear()
        serverState.hostPeers.clear()
        serverState.hostUrl = ''
        serverState.hostComputerName = ''
        serverState.hostStartedAt = ''
        serverState.myUrl = ''
    })

    it.each([
        { myUrl: '', hostUrl: '', expected: false },
        { myUrl: '', hostUrl: 'http://172.16.0.1:45177', expected: false },
        { myUrl: 'http://172.16.0.1:45177', hostUrl: '', expected: false },
        { myUrl: 'http://172.16.0.1:45177', hostUrl: 'http://172.16.0.1:45177', expected: true },
        { myUrl: 'http://172.16.0.1:45177', hostUrl: 'http://172.16.0.2:45177', expected: false },
        { myUrl: 'http://172.16.0.1:45177', hostUrl: 'http://172.16.0.1:45178', expected: false },
        { myUrl: 'http://172.16.0.1:45177', hostUrl: 'http://172.16.0.1:45177/some/path', expected: true },
    ])('should return $expected for myUrl: $myUrl and hostUrl: $hostUrl', ({ myUrl, hostUrl, expected }) => {
        serverState.myUrl = myUrl
        serverState.hostUrl = hostUrl

        const result = getAmHosting()
        expect(result).toBe(expected)
    })
})

describe('updateMyProjectsToHost', () => {
    beforeEach(() => {
        // Reset serverState before each test
        serverState.myProjectsToHost.clear()
    })

    it.each([
        { initialMyHostProjects: [], hostProject: true, project: 'project1', expectedMyHostProjects: ['project1'] },
        { initialMyHostProjects: ['project1'], hostProject: true, project: 'project1', expectedMyHostProjects: ['project1'] },
        { initialMyHostProjects: ['project1'], hostProject: true, project: 'project2', expectedMyHostProjects: ['project1', 'project2'] },
        { initialMyHostProjects: ['project1', 'project2'], hostProject: false, project: 'project2', expectedMyHostProjects: ['project1'] },
        { initialMyHostProjects: ['project1', 'project2'], hostProject: false, project: 'project3', expectedMyHostProjects: ['project1', 'project2'] },
    ])('should update hostProjects correctly for myUrl: $myUrl, hostUrl: $hostUrl, hostProject: $hostProject', ({ initialMyHostProjects, hostProject, project, expectedMyHostProjects }) => {
        serverState.myProjectsToHost = new Set(initialMyHostProjects)

        updateMyProjectsToHost(project, hostProject)
        expect([...serverState.myProjectsToHost]).toEqual(expectedMyHostProjects)
    })
})
