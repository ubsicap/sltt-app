import { describe, it, expect, vi, beforeEach } from 'vitest'
import { canWriteToFolder } from './hostFolder'
import { stat, mkdir, writeFile, unlink, rmdir } from 'fs/promises'
import * as path from 'path'
import disk from 'diskusage'
import { checkHostStoragePath } from './serverState'
import { isNodeError } from './utils'

vi.mock('fs/promises')
vi.mock('path')
vi.mock('diskusage')
vi.mock('./serverState')
vi.mock('./utils')

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
        expect(result.diskUsage).toBe(diskUsageMock)
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

        expect(result.error).toBe('Write permission error.')
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
        vi.mocked(stat).mockRejectedValue(new Error('ENOENT'))
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
