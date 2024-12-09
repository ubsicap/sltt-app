import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { appendFile, mkdtemp, readFile } from 'fs/promises'
import { ensureDir, remove } from 'fs-extra'
import { handleGetStorageProjects, handleAddStorageProject, handleRemoveStorageProject, handleProbeConnections, handleConnectToUrl, SLTT_APP_LAN_FOLDER } from './connections'
import { AddStorageProjectArgs, GetStorageProjectsArgs, RemoveStorageProjectArgs, ProbeConnectionsArgs, ConnectToUrlArgs } from './connections.d'
import { fileURLToPath, pathToFileURL } from 'url'

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
        const args: GetStorageProjectsArgs = { clientId: 'client1', url: 'url1' }
        await expect(handleGetStorageProjects('', args)).rejects.toThrow('LAN storage path is not set')
    })

    it('should throw an error if the LAN storage path is invalid', async () => {
        const args: GetStorageProjectsArgs = { clientId: 'client1', url: 'url1' }
        const invalidPath = join(tempDir, 'invalid-path')
        await ensureDir(invalidPath)
        await expect(handleGetStorageProjects(invalidPath, args)).rejects.toThrow(`LAN storage path is invalid: ${tempDir}`)
    })

    it('should return an empty array if no projects are added', async () => {
        const args: GetStorageProjectsArgs = { clientId: 'client1', url: 'url1' }
        const response = await handleGetStorageProjects(tempDir, args)
        expect(response).toEqual([])
    })

    it('should return added projects', async () => {
        const args: GetStorageProjectsArgs = { clientId: 'client1', url: 'url1' }
        const project = 'project1'
        const adminEmail = 'admin@example.com'
        await appendFile(`${tempDir}/whitelist.sltt-projects`, `${Date.now()}\t+\t${project}\t${adminEmail}\n`)
        const response = await handleGetStorageProjects(tempDir, args)
        expect(response).toEqual([project])
    })

    it('should not return removed projects', async () => {
        const args: GetStorageProjectsArgs = { clientId: 'client1', url: 'url1' }
        const project = 'project1'
        const adminEmail = 'admin@example.com'
        await appendFile(`${tempDir}/whitelist.sltt-projects`, `${Date.now()}\t+\t${project}\t${adminEmail}\n`)
        await appendFile(`${tempDir}/whitelist.sltt-projects`, `${Date.now()}\t-\t${project}\t${adminEmail}\n`)
        const response = await handleGetStorageProjects(tempDir, args)
        expect(response).toEqual([])
    })
})

describe('handleAddStorageProject', () => {
    it('should add a project to the whitelist', async () => {
        const args: AddStorageProjectArgs = { clientId: 'client1', url: 'url1', project: 'project1', adminEmail: 'admin@example.com' }
        await handleAddStorageProject(tempDir, args)
        const whitelistContent = await readFile(`${tempDir}/whitelist.sltt-projects`, 'utf-8')
        expect(whitelistContent).toContain(`\t+\t${args.project}\t${args.adminEmail}\n`)
    })
})

describe('handleRemoveStorageProject', () => {
    it('should remove a project from the whitelist', async () => {
        const addArgs: AddStorageProjectArgs = { clientId: 'client1', url: 'url1', project: 'project1', adminEmail: 'admin@example.com' }
        await handleAddStorageProject(tempDir, addArgs)
        const removeArgs: RemoveStorageProjectArgs = { clientId: 'client1', url: 'url1', project: 'project1', adminEmail: 'admin@example.com' }
        await handleRemoveStorageProject(tempDir, removeArgs)
        const whitelistContent = await readFile(`${tempDir}/whitelist.sltt-projects`, 'utf-8')
        expect(whitelistContent).toContain(`\t-\t${removeArgs.project}\t${removeArgs.adminEmail}\n`)
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
        await expect(handleConnectToUrl(args)).rejects.toThrow(`Connection path '${url}' is invalid due to error: `)
    })

    it('should throw an error if the file path is inaccessible', async () => {
        const url = pathToFileURL(join(tempDir, 'non-existent-file')).href
        const args: ConnectToUrlArgs = { url, clientId: 'client1', project: 'project1' }
        await expect(handleConnectToUrl(args)).rejects.toThrow(`Connection path '${fileURLToPath(url)}' is inaccessible due to error: `)
    })
})
