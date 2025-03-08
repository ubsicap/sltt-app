import { describe, it, expect, vi, beforeEach } from 'vitest'
import { canWriteToFolder, finalizeHostFolder, loadHostFolder, saveHostFolder } from './hostFolder'
import { stat, mkdir, writeFile, unlink, rmdir } from 'fs/promises'
import * as path from 'path'
import disk from 'diskusage'
import { checkHostStoragePath, serverState, setLANStoragePath, SLTT_APP_LAN_FOLDER } from './serverState'
import { isNodeError } from './utils'
import { platform } from 'os'
import { normalize } from 'path'

vi.mock('os')
vi.mock('fs/promises')
vi.mock('path')
vi.mock('diskusage')
vi.mock('./serverState')
vi.mock('./utils')

class MockedNodeError extends Error {
    code: string
    constructor(code: string) {
        super()
        this.code = code
    }
}

describe('canWriteToFolder', () => {
    const folderPath = '/test-folder'
    const normalizedFolder = '/normalized-test-folder'
    const diskUsageMock = { available: 1000, free: 2000, total: 3000 }

    beforeEach(() => {
        vi.resetAllMocks()
        vi.mocked(path.normalize).mockReturnValue(normalizedFolder)
        vi.mocked(path.extname).mockReturnValue('')
        vi.mocked(path.isAbsolute).mockReturnValue(true)
        vi.mocked(disk.check).mockResolvedValue(diskUsageMock)
        vi.mocked(isNodeError).mockReturnValue(true)
    })

    it('should return error if folder path has an extension', async () => {
        vi.mocked(path.extname).mockReturnValue('.txt')

        const result = await canWriteToFolder(folderPath)

        expect(result.error).toBe('Extension is not allowed in folder path: ".txt"')
        expect(result.diskUsage).toBeUndefined()
    })

    it('should return error if folder path is not absolute', async () => {
        vi.mocked(path.isAbsolute).mockReturnValue(false)

        const result = await canWriteToFolder(folderPath)

        expect(result.error).toBe('Full drive path required.')
        expect(result.diskUsage).toBeUndefined()
    })

    it('should return error if checkHostStoragePath throws an error', async () => {
        const errorMessage = 'Host storage path error'
        vi.mocked(checkHostStoragePath).mockImplementation(() => {
            throw new Error(errorMessage)
        })

        const result = await canWriteToFolder(folderPath)

        expect(result.error).toBe(errorMessage)
        expect(result.diskUsage).toBeUndefined()
    })

    it('should return error if path exists but is not a directory', async () => {
        vi.mocked(stat).mockResolvedValue({ isDirectory: () => false } as any)

        const result = await canWriteToFolder(folderPath)

        expect(result.error).toBe('Path exists but is not a directory.')
        expect(result.diskUsage).toBe(diskUsageMock)
    })

    it('should return error if folder does not exist and cannot be created', async () => {
        const mkdirError = new Error('Mkdir error')
        vi.mocked(stat).mockRejectedValue(new Error('ENOENT'))
        vi.mocked(mkdir).mockRejectedValue(mkdirError)

        const result = await canWriteToFolder(folderPath)

        expect(result.error).toBe('Error accessing folder.')
        expect(result.diskUsage).toBe(diskUsageMock)
    })

    it('should return error if there is an error accessing the folder', async () => {
        const accessError = new Error('Access error')
        vi.mocked(stat).mockRejectedValue(accessError)
        vi.mocked(isNodeError).mockReturnValue(false)

        const result = await canWriteToFolder(folderPath)

        expect(result.error).toBe('Error accessing folder.')
        expect(result.diskUsage).toBe(diskUsageMock)
    })

    it('should return success if folder exists and is writable', async () => {
        vi.mocked(stat).mockResolvedValue({ isDirectory: () => true } as any)

        const result = await canWriteToFolder(folderPath)

        expect(result.error).toBe('')
        expect(result.diskUsage).toBe(diskUsageMock)
        expect(writeFile).toHaveBeenCalledWith(path.join(normalizedFolder, 'tempfile.tmp'), 'test')
        expect(unlink).toHaveBeenCalledWith(path.join(normalizedFolder, 'tempfile.tmp'))
    })

    it('should return success if folder does not exist but can be created and is writable', async () => {
        vi.mocked(stat).mockRejectedValue(new MockedNodeError('ENOENT'))
        vi.mocked(mkdir).mockResolvedValue(undefined)

        const result = await canWriteToFolder(folderPath)

        expect(result.error).toBe('')
        expect(result.diskUsage).toBe(diskUsageMock)
        expect(mkdir).toHaveBeenCalledWith(folderPath, { recursive: true })
        expect(writeFile).toHaveBeenCalledWith(path.join(folderPath, 'tempfile.tmp'), 'test')
        expect(unlink).toHaveBeenCalledWith(path.join(folderPath, 'tempfile.tmp'))
        expect(rmdir).toHaveBeenCalledWith(folderPath)
    })
})

describe('finalizeHostFolder', () => {
    it('should return the same path if it already ends with the required folder', () => {
        const hostFolder = 'C:\\sltt-app\\lan'
        const result = finalizeHostFolder(hostFolder)
        expect(result).toBe('C:\\sltt-app\\lan')
    })

    it('should append the required folder if it does not end with it', () => {
        const hostFolder = 'C:\\sltt-app'
        const result = finalizeHostFolder(hostFolder)
        expect(result).toBe('C:\\sltt-app\\lan')
    })

    it('should handle trailing slashes correctly', () => {
        const hostFolder = 'C:\\sltt-app\\'
        const result = finalizeHostFolder(hostFolder)
        expect(result).toBe('C:\\sltt-app\\lan')
    })

    it('should insert the required folder in the correct position', () => {
        const hostFolder = 'C:\\subfolder'
        const result = finalizeHostFolder(hostFolder)
        expect(result).toBe('C:\\subfolder\\sltt-app\\lan')
    })

    it('should handle nested folders correctly', () => {
        const hostFolder = 'C:\\sltt-app\\lan\\subfolder'
        const result = finalizeHostFolder(hostFolder)
        expect(result).toBe('C:\\sltt-app\\lan\\subfolder\\sltt-app\\lan')
    })
})

describe('loadHostFolder', () => {
    const defaultFolder = platform() === 'win32' ? 'C:\\sltt-app\\lan' : '/Users/Shared/sltt-app/lan'
    const requiredEnd = normalize(SLTT_APP_LAN_FOLDER)
    const hostFolder = '/test-folder'
    const diskUsageMock = { available: 1000, free: 2000, total: 3000 }

    beforeEach(() => {
        vi.resetAllMocks()
        serverState.myLanStoragePath = hostFolder
        vi.mocked(disk.check).mockResolvedValue(diskUsageMock)
    })

    it('should return the correct response when disk check is successful', async () => {
        const result = await loadHostFolder()
        expect(result).toEqual({ hostFolder, defaultFolder, requiredEnd, diskUsage: diskUsageMock })
    })

    it('should return the correct response when disk check fails', async () => {
        vi.mocked(disk.check).mockRejectedValue(new Error('Disk check error'))
        const result = await loadHostFolder()
        expect(result).toEqual({ hostFolder, defaultFolder, requiredEnd, diskUsage: undefined })
    })
})

describe('saveHostFolder', () => {
    const hostFolder = 'C:\\sltt-app'
    const finalFolder = 'C:\\sltt-app\\lan'

    beforeEach(() => {
        vi.resetAllMocks()
        vi.mocked(finalizeHostFolder).mockReturnValue(finalFolder)
        vi.mocked(mkdir).mockResolvedValue(undefined)
    })

    it('should save the host folder and return the correct response', async () => {
        const result = await saveHostFolder(hostFolder)
        expect(result).toEqual({ finalHostFolder: finalFolder })
        expect(mkdir).toHaveBeenCalledWith(finalFolder, { recursive: true })
        expect(setLANStoragePath).toHaveBeenCalledWith(finalFolder)
    })
})
