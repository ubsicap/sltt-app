import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { appendFile, mkdtemp, readFile } from 'fs/promises'
import { ensureDir, remove } from 'fs-extra'
import { handleGetStorageProjects, handleAddStorageProject, handleRemoveStorageProject, handleProbeConnections, handleConnectToUrl, SLTT_APP_LAN_FOLDER } from './connections'
import { AddStorageProjectArgs, GetStorageProjectsArgs, RemoveStorageProjectArgs, ProbeConnectionsArgs, ConnectToUrlArgs } from './connections.d'
import { fileURLToPath, pathToFileURL } from 'url'
import { serverState } from './serverState'

let tempDir: string

beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = join(await mkdtemp(join(tmpdir(), 'connections-')), SLTT_APP_LAN_FOLDER)
    await ensureDir(tempDir)
})

afterEach(async () => {
    // Clean up the temporary directory after each test
    await remove(tempDir)
})

describe('handleGetStorageProjects', () => {
    it('should throw an error if the LAN storage path is not set', async () => {
        const args: GetStorageProjectsArgs = { clientId: 'client1', url: '' }
        await expect(handleGetStorageProjects(args)).rejects.toThrow('LAN storage path is not set')
    })

    it('should throw an error if the LAN storage path is invalid', async () => {
        const invalidPath = join(tempDir, 'invalid-path')
        await ensureDir(invalidPath)
        const args: GetStorageProjectsArgs = { clientId: 'client1', url: invalidPath }
        await expect(handleGetStorageProjects(args)).rejects.toThrow(`LAN storage path is invalid: ${invalidPath}`)
    })

    it('should return an empty array if no projects are added', async () => {
        const args: GetStorageProjectsArgs = { clientId: 'client1', url: pathToFileURL(tempDir).toString() }
        const response = await handleGetStorageProjects(args)
        expect(response).toEqual([])
    })

    it('should return added projects', async () => {
        const args: GetStorageProjectsArgs = { clientId: 'client1', url: pathToFileURL(tempDir).toString() }
        const project = 'project1'
        const adminEmail = 'admin@example.com'
        await appendFile(`${tempDir}/whitelist.sltt-projects`, `${Date.now()}\t+\t${project}\t${adminEmail}\n`)
        const response = await handleGetStorageProjects(args)
        expect(response).toEqual([project])
    })

    it('should not return removed projects', async () => {
        const args: GetStorageProjectsArgs = { clientId: 'client1', url: pathToFileURL(tempDir).toString() }
        const project = 'project1'
        const adminEmail = 'admin@example.com'
        await appendFile(`${tempDir}/whitelist.sltt-projects`, `${Date.now()}\t+\t${project}\t${adminEmail}\n`)
        await appendFile(`${tempDir}/whitelist.sltt-projects`, `${Date.now()}\t-\t${project}\t${adminEmail}\n`)
        const response = await handleGetStorageProjects(args)
        expect(response).toEqual([])
    })
})

describe('handleAddStorageProject', () => {
    it.each([
        { case: 'not our host url - no host url', hostProject: false, myUrl: '', hostUrl: '', expectedHostUrl: '', expectedHostProjects: [] },
        { case: 'not our host url - host url, no hostProject', hostProject: false, myUrl: '', hostUrl: 'http://172.16.0.1:45177', expectedHostUrl: 'http://172.16.0.1:45177', expectedHostProjects: [] },
        { case: 'not our host url - host url, with hostProject', hostProject: true, myUrl: '', hostUrl: 'http://172.16.0.1:45177', expectedHostUrl: 'http://172.16.0.1:45177', expectedHostProjects: [] },
        { case: 'our host url - host url, no hostProject', hostProject: false, myUrl: 'http://172.16.0.1:45177', hostUrl: 'http://172.16.0.1:45177', expectedHostUrl: '', expectedHostProjects: [] },
        { case: 'our host url - host url, with hostProject', hostProject: true, myUrl: 'http://172.16.0.1:45177', hostUrl: 'http://172.16.0.1:45177', expectedHostUrl: 'http://172.16.0.1:45177', expectedHostProjects: ['project1'] },
    ])('should add a project to the whitelist - $case', async ({ myUrl, hostUrl, expectedHostUrl, hostProject, expectedHostProjects, }) => {
        serverState.myUrl = myUrl
        serverState.hostUrl = hostUrl
        const args: AddStorageProjectArgs = { clientId: 'client1', url: pathToFileURL(tempDir).toString(), project: 'project1', adminEmail: 'admin@example.com', hostProject }
        await handleAddStorageProject(args)
        const whitelistContent = await readFile(`${tempDir}/whitelist.sltt-projects`, 'utf-8')
        expect(whitelistContent).toContain(`\t+\t${args.project}\t${args.adminEmail}\n`)
        const { hostUrl: hostUrl1, hostProjects } = serverState
        expect(hostUrl1).toEqual(expectedHostUrl)
        expect([...hostProjects]).toEqual(expectedHostProjects)
    })
})

describe('handleRemoveStorageProject', () => {
    it.each([
        { case: 'not our host url - no host url', hostProject: false, myUrl: '', hostUrl: '', expectedHostUrl: '', expectedHostProjects: [] },
        { case: 'not our host url - host url, no hostProject', hostProject: false, myUrl: '', hostUrl: 'http://172.16.0.1:45177', expectedHostUrl: 'http://172.16.0.1:45177', hostProjects: ['project1'], expectedHostProjects: ['project1'] },
        { case: 'not our host url - host url, with hostProject', hostProject: true, myUrl: '', hostUrl: 'http://172.16.0.1:45177', expectedHostUrl: 'http://172.16.0.1:45177', hostProjects: ['project1'], expectedHostProjects: ['project1'] },
        { case: 'our host url - host url, no hostProject', hostProject: false, myUrl: 'http://172.16.0.1:45177', hostUrl: 'http://172.16.0.1:45177', expectedHostUrl: '', hostProjects: [], expectedHostProjects: [] },
        { case: 'our host url - host url, with hostProject', hostProject: true, myUrl: 'http://172.16.0.1:45177', hostUrl: 'http://172.16.0.1:45177', expectedHostUrl: '', hostProjects: [], expectedHostProjects: [] },
    ])('should remove a project from the whitelist - $case', async ({
        myUrl, hostUrl, hostProject, hostProjects, expectedHostUrl, expectedHostProjects,
    }) => {
        serverState.myUrl = myUrl
        serverState.hostUrl = hostUrl
        serverState.hostProjects = new Set(hostProjects)

        const addArgs: AddStorageProjectArgs = { clientId: 'client1', url: pathToFileURL(tempDir).toString(), project: 'project1', adminEmail: 'admin@example.com', hostProject }
        await handleAddStorageProject(addArgs)
        const removeArgs: RemoveStorageProjectArgs = { clientId: 'client1', url: pathToFileURL(tempDir).toString(), project: 'project1', adminEmail: 'admin@example.com' }
        await handleRemoveStorageProject(removeArgs)
        const whitelistContent = await readFile(`${tempDir}/whitelist.sltt-projects`, 'utf-8')
        expect(whitelistContent).toContain(`\t-\t${removeArgs.project}\t${removeArgs.adminEmail}\n`)
        const { hostUrl: hostUrl1, hostProjects: hostProjects1 } = serverState
        expect(hostUrl1).toEqual(expectedHostUrl)
        expect([...hostProjects1]).toEqual(expectedHostProjects)
    })
})

describe('handleProbeConnections', () => {
    it('should return accessible status for URLs', async () => {
        const urls = [pathToFileURL(tempDir).href]
        const args: ProbeConnectionsArgs = { clientId: 'client1' }
        const response = await handleProbeConnections(tempDir, args)
        expect(response).toEqual([{ url: urls[0], accessible: true }])
    })

    it('should return inaccessible status for invalid URLs', async () => {
        const urls = ['invalid-url']
        const defaultUrl = pathToFileURL(tempDir).href
        const args: ProbeConnectionsArgs = { urls, clientId: 'client1' }
        const response = await handleProbeConnections(tempDir, args)
        expect(response).toEqual([
            { url: defaultUrl, accessible: true },
            { url: urls[0], accessible: false, error: expect.any(String) }
        ])
    })
})

describe('handleConnectToUrl', () => {
    it('should return the file path if accessible', async () => {
        const url = pathToFileURL(tempDir).href
        const args: ConnectToUrlArgs = { url, clientId: 'client1', project: 'project1' }
        const response = await handleConnectToUrl(args)
        expect(response).toEqual(fileURLToPath(url))
    })

    it('should throw an error if the URL is invalid', async () => {
        const url = 'invalid-url'
        const args: ConnectToUrlArgs = { url, clientId: 'client1', project: 'project1' }
        await expect(handleConnectToUrl(args)).rejects.toThrow(`Connection URL '${url}' is invalid due to error: `)
    })

    it('should throw an error if the file path is inaccessible', async () => {
        const url = pathToFileURL(join(tempDir, 'non-existent-file')).href
        const args: ConnectToUrlArgs = { url, clientId: 'client1', project: 'project1' }
        await expect(handleConnectToUrl(args)).rejects.toThrow(`Connection path '${fileURLToPath(url)}' is inaccessible due to error: `)
    })
})
