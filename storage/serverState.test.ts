import { describe, it, expect, beforeEach } from 'vitest'
import { serverState, updateHostProjects, getAmHosting } from './serverState'

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

describe('updateHostProjects', () => {
    beforeEach(() => {
        // Reset serverState before each test
        serverState.hostProjects.clear()
        serverState.hostUrl = ''
        serverState.hostComputerName = ''
        serverState.hostStartedAt = ''
        serverState.myUrl = ''
        serverState.hostPeers.clear()
    })

    it.each([
        { myUrl: '', hostUrl: '', hostProject: true, project: 'project1', expected: false },
        { myUrl: '', hostUrl: 'http://172.16.0.1:45177', hostProject: true, project: 'project1', expected: false },
        { myUrl: 'http://172.16.0.1:45177', hostUrl: '', hostProject: true, project: 'project1', expected: false },
        { myUrl: 'http://172.16.0.1:45177', hostUrl: 'http://172.16.0.1:45177', hostProject: true, project: 'project1', expected: true },
        { myUrl: 'http://172.16.0.1:45177', hostUrl: 'http://172.16.0.1:45177', hostProject: false, project: 'project1', expected: false },
        { myUrl: 'http://172.16.0.1:45177', hostUrl: 'http://172.16.0.2:45178', hostProject: true, project: 'project1', expected: false },
        { myUrl: 'http://172.16.0.1:45177', hostUrl: 'http://172.16.0.2:45178', hostProject: false, project: 'project1', expected: false },
    ])('should update hostProjects correctly for myUrl: $myUrl, hostUrl: $hostUrl, hostProject: $hostProject', ({ myUrl, hostUrl, hostProject, project, expected }) => {
        serverState.myUrl = myUrl
        serverState.hostUrl = hostUrl

        updateHostProjects(project, hostProject)
        expect(serverState.hostProjects.has(project)).toBe(expected)
    })

    it('should not add a project to hostProjects if server is not hosting', () => {
        serverState.myUrl = 'http://172.16.0.1:45177'
        serverState.hostUrl = 'http://172.16.0.2:45178'

        updateHostProjects('project1', true)
        expect(serverState.hostProjects.has('project1')).toBe(false)
    })

    it('should not remove a project from hostProjects if server is not hosting', () => {
        serverState.myUrl = 'http://172.16.0.1:45177'
        serverState.hostUrl = 'http://172.16.0.2:45178'
        serverState.hostProjects.add('project1')

        updateHostProjects('project1', false)
        expect(serverState.hostProjects.has('project1')).toBe(true)
    })

    it('should clear hostUrl if there are no more hostProjects', () => {
        serverState.myUrl = 'http://172.16.0.1:45177'
        serverState.hostUrl = 'http://172.16.0.1:45177'
        serverState.hostProjects.add('project1')

        updateHostProjects('project1', false)
        expect(serverState.hostProjects.size).toBe(0)
        expect(serverState.hostUrl).toBe('')
    })

    it('should not clear hostUrl if there are still hostProjects', () => {
        serverState.myUrl = 'http://172.16.0.1:45177'
        serverState.hostUrl = 'http://172.16.0.1:45177'
        serverState.hostProjects.add('project1')
        serverState.hostProjects.add('project2')

        updateHostProjects('project1', false)
        expect(serverState.hostProjects.size).toBe(1)
        expect(serverState.hostUrl).toBe('http://172.16.0.1:45177')
    })
})
