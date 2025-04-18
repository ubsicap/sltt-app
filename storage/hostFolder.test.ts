import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { canWriteToFolder, finalizeHostFolder, loadHostFolder, saveHostFolder } from './hostFolder'
import { stat, mkdir, writeFile, unlink, rmdir } from 'fs/promises'
import * as path from 'path'
import disk from 'diskusage'
import { checkHostStoragePath, serverState, setLANStoragePath } from './serverState'
import { isNodeError } from './utils'
import { platform } from 'os'
import { normalize } from 'path'
import { HOST_FOLDER_ERROR_CODE_ERROR_ACCESSING_FOLDER, HOST_FOLDER_ERROR_CODE_EXTENSION_IS_NOT_ALLOWED_IN_FOLDER, HOST_FOLDER_ERROR_CODE_FULL_DRIVE_PATH_REQUIRED, HOST_FOLDER_ERROR_CODE_PATH_EXISTS_BUT_NOT_DIRECTORY, HOST_FOLDER_ERROR_CODE_UNKNOWN_ERROR, HOST_FOLDER_ERROR_CODE_WRITE_PERMISSION_ERROR } from './hostFolder.d'

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

        expect(result.errorCode).toBe(HOST_FOLDER_ERROR_CODE_EXTENSION_IS_NOT_ALLOWED_IN_FOLDER)
        expect(result.errorInfo).toBe('.txt')
        expect(result.diskUsage).toBeUndefined()
    })

    it('should return error if folder path is not absolute', async () => {
        vi.mocked(path.isAbsolute).mockReturnValue(false)

        const result = await canWriteToFolder(folderPath)

        expect(result.errorCode).toBe(HOST_FOLDER_ERROR_CODE_FULL_DRIVE_PATH_REQUIRED)
        expect(result.errorInfo).toBe('')
        expect(result.diskUsage).toBeUndefined()
    })

    it('should return error if checkHostStoragePath throws an error', async () => {
        const errorMessage = 'Host storage path error'
        vi.mocked(checkHostStoragePath).mockImplementation(() => {
            throw new Error(errorMessage)
        })

        const result = await canWriteToFolder(folderPath)

        expect(result.errorCode).toBe(HOST_FOLDER_ERROR_CODE_UNKNOWN_ERROR)
        expect(result.errorInfo).toBe(errorMessage)
        expect(result.diskUsage).toBeUndefined()
    })

    it('should return error if path exists but is not a directory', async () => {
        vi.mocked(stat).mockResolvedValue({ isDirectory: () => false } as any)

        const result = await canWriteToFolder(folderPath)

        expect(result.errorCode).toBe(HOST_FOLDER_ERROR_CODE_PATH_EXISTS_BUT_NOT_DIRECTORY)
        expect(result.errorInfo).toBe('')
        expect(result.diskUsage).toBeUndefined()
    })

    it('should return error if folder does not exist and cannot be created', async () => {
        const mkdirError = new Error('Mkdir error')
        vi.mocked(stat).mockRejectedValue(new MockedNodeError('ENOENT'))
        vi.mocked(mkdir).mockRejectedValue(mkdirError)

        const result = await canWriteToFolder(folderPath)

        expect(result.errorCode).toBe(HOST_FOLDER_ERROR_CODE_WRITE_PERMISSION_ERROR)
        expect(result.errorInfo).toBe(mkdirError.message)
        expect(result.diskUsage).toBeUndefined()
    })

    it('should return error if there is an error accessing the folder', async () => {
        const accessError = new Error('Access error')
        vi.mocked(stat).mockRejectedValue(accessError)
        vi.mocked(isNodeError).mockReturnValue(false)

        const result = await canWriteToFolder(folderPath)

        expect(result.errorCode).toBe(HOST_FOLDER_ERROR_CODE_ERROR_ACCESSING_FOLDER)
        expect(result.errorInfo).toBe(accessError.message)
        expect(result.diskUsage).toBeUndefined()
    })

    it('should return success if folder exists and is writable', async () => {
        vi.mocked(stat).mockResolvedValue({ isDirectory: () => true } as any)

        const result = await canWriteToFolder(folderPath)

        expect(result.errorCode).toBe('')
        expect(result.errorInfo).toBe('')
        expect(result.diskUsage).toBe(diskUsageMock)
        expect(writeFile).toHaveBeenCalledWith(path.join(normalizedFolder, 'tempfile.tmp'), 'test')
        expect(unlink).toHaveBeenCalledWith(path.join(normalizedFolder, 'tempfile.tmp'))
    })

    it('should return success if folder does not exist but can be created and is writable', async () => {
        vi.mocked(stat).mockRejectedValue(new MockedNodeError('ENOENT'))
        vi.mocked(mkdir).mockResolvedValue(undefined)

        const result = await canWriteToFolder(normalizedFolder)

        expect(result.errorCode).toBe('')
        expect(result.errorInfo).toBe('')
        expect(result.diskUsage).toBe(diskUsageMock)
        expect(mkdir).toHaveBeenCalledWith(normalizedFolder, { recursive: true })
        expect(writeFile).toHaveBeenCalledWith(path.join(normalizedFolder, 'tempfile.tmp'), 'test')
        expect(unlink).toHaveBeenCalledWith(path.join(normalizedFolder, 'tempfile.tmp'))
        expect(rmdir).toHaveBeenCalledWith(normalizedFolder)
    })
})

describe('finalizeHostFolder - win32', () => {
    beforeAll(() => {
        vi.mocked(path.normalize).mockImplementation((path: string) => path.replace(/\//g, '\\'))
        vi.mocked(path.join).mockImplementation((...paths: string[]) => paths.join('\\'))
        vi.mocked(platform).mockReturnValue('win32')
    })
    
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

function winNormalize(path: string): string {
    if (!path) return '.'
    return path.replace(/\//g, '\\')
}

function macNormalize(path: string): string {
    if (!path) return '.'
    return path.replace(/\\/g, '/')
}

describe('loadHostFolder', () => {
    const diskUsageMock = { available: 1000, free: 2000, total: 3000 }

    beforeAll(() => {
        vi.resetAllMocks()
        vi.mocked(disk.check).mockResolvedValue(diskUsageMock)
    })

    it.each([
        {
            platformValue: 'win32' as NodeJS.Platform,
            normalizeFn: winNormalize,
            myLanStoragePath: 'C:/subfolder/sltt-app/lan',
            hostFolder: 'C:\\subfolder\\sltt-app\\lan',
            defaultFolder: 'C:\\sltt-app\\lan',
            requiredEnd: 'sltt-app\\lan'
        },
        {
            platformValue: 'darwin' as NodeJS.Platform,
            normalizeFn: macNormalize,
            myLanStoragePath: '\\subfolder\\sltt-app\\lan',
            hostFolder: '/subfolder/sltt-app/lan',
            defaultFolder: '/Users/Shared/sltt-app/lan',
            requiredEnd: 'sltt-app/lan'
        },
        {
            platformValue: 'win32' as NodeJS.Platform,
            normalizeFn: winNormalize,
            myLanStoragePath: '',
            hostFolder: '',
            defaultFolder: 'C:\\sltt-app\\lan',
            requiredEnd: 'sltt-app\\lan'
        },
        {
            platformValue: 'darwin' as NodeJS.Platform,
            normalizeFn: macNormalize,
            myLanStoragePath: '',
            hostFolder: '',
            defaultFolder: '/Users/Shared/sltt-app/lan',
            requiredEnd: 'sltt-app/lan'
        }
    ])('should return the correct response when disk check is successful - $platformValue $hostFolder', async ({
        platformValue, normalizeFn, myLanStoragePath, hostFolder, defaultFolder, requiredEnd
    }: {
        platformValue: NodeJS.Platform, normalizeFn: (path: string) => string, myLanStoragePath: string, hostFolder: string, defaultFolder: string, requiredEnd: string
    }) => {
        vi.mocked(platform).mockReturnValue(platformValue)
        vi.mocked(normalize).mockImplementation(normalizeFn)
        serverState.myLanStoragePath = myLanStoragePath
        const result = await loadHostFolder()
        expect(result).toEqual({ hostFolder, defaultFolder, requiredEnd, diskUsage: diskUsageMock })
    })

    it('should return the correct response when disk check fails', async () => {
        const platformValue = 'win32'
        const myLanStoragePath = 'C:/subfolder/sltt-app/lan'
        const hostFolder = 'C:\\subfolder\\sltt-app\\lan'
        const defaultFolder = 'C:\\sltt-app\\lan'
        const requiredEnd = 'sltt-app\\lan'
        vi.mocked(normalize).mockImplementation(winNormalize)
        vi.mocked(platform).mockReturnValue(platformValue)
        vi.mocked(disk.check).mockRejectedValue(new Error('Disk check error'))
        serverState.myLanStoragePath = myLanStoragePath
        const result = await loadHostFolder()
        expect(result).toEqual({ hostFolder, defaultFolder, requiredEnd, diskUsage: undefined })
    })
})

describe('saveHostFolder', () => {
    const hostFolder = 'C:\\sltt-app'
    const finalFolder = 'C:\\sltt-app\\lan'

    beforeAll(() => {
        vi.mocked(path.normalize).mockImplementation((path: string) => path.replace(/\//g, '\\'))
        vi.mocked(path.join).mockImplementation((...paths: string[]) => paths.join('\\'))
        vi.mocked(platform).mockReturnValue('win32')
    })

    it('should save the host folder and return the correct response', async () => {
        const result = await saveHostFolder(hostFolder)
        expect(result).toEqual({ finalHostFolder: finalFolder })
        expect(mkdir).toHaveBeenCalledWith(finalFolder, { recursive: true })
        expect(setLANStoragePath).toHaveBeenCalledWith(finalFolder)
    })
})
