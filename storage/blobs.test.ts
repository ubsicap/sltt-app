import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { HandleStoreBlobArgs, filterBlobFiles, handleRetrieveAllBlobIds, transformBlobFilePathsToBlobInfo, handleUpdateBlobUploadedStatus, handleStoreBlob, buildBlobPath, getBlobInfo, UPLOAD_QUEUE_FOLDER } from './blobs'
import { mkdtemp, rm, mkdir, writeFile, rename, readFile, access } from 'fs/promises'
import { tmpdir } from 'os'
import { join, win32 } from 'path'
import { RetrieveAllBlobIdsResponse } from './blobs.d'
import { handleRetrieveBlobInfo, cleanupUploadQueueFolder } from './blobs'
import { pathExists } from 'fs-extra'

describe('filterBlobFiles', () => {
    it('should filter out files that are not pasDoc or video blobs', () => {
        const allPosixFilePaths = [
            '/base/path/project1/240925_150335/240925_160335/240925_150335-10',
            '/base/path/project1/240925_150335/240925_160335/pasDoc_221231_163557/2024_08_31T11_34_55.102Z.txt-1',
            '/base/path/project1/invalid_file.txt-d',
            '/base/path/project1/another_invalid_file.doc',
            '/base/path/project1/240925_150335/240925_160335/123456_123456-2',
            '/base/path/project1/240925_150335/240925_160335/pasDoc_221231_163557/2024_08_31T11_34_55.102Z.txt-2'
        ]
        const expected = [
            '/base/path/project1/240925_150335/240925_160335/240925_150335-10',
            '/base/path/project1/240925_150335/240925_160335/pasDoc_221231_163557/2024_08_31T11_34_55.102Z.txt-1',
            '/base/path/project1/240925_150335/240925_160335/123456_123456-2',
            '/base/path/project1/240925_150335/240925_160335/pasDoc_221231_163557/2024_08_31T11_34_55.102Z.txt-2'
        ]
        const result = filterBlobFiles(allPosixFilePaths)
        expect(result).toEqual(expected)
    })

    it('should throw an error if any file path contains backslashes', () => {
        const allPosixFilePaths = [
            '240925_150335-1',
            'invalid\\file.txt'
        ]
        expect(() => filterBlobFiles(allPosixFilePaths)).toThrow('All file paths must be in posix format')
    })
})

describe('transformBlobFilePathsToBlobIds', () => {
    it('should transform blob file paths to blob IDs', () => {
        const blobsPath = '/base/path'
        const blobFilePaths = [
            `/base/path/${UPLOAD_QUEUE_FOLDER}/2/project1/250925_150335/250925_160335/250925_150335-1`,
            '/base/path/project1/240925_150335/240925_160335/240925_150335-1',
            '/base/path/project1/240925_150335/240925_160335/pasDoc_221231_163557/2024_08_31T11_34_55.102Z.txt-1'
        ]
        const expected: RetrieveAllBlobIdsResponse = [
            {
                blobId: 'project1/250925_150335/250925_160335/250925_150335-1',
                isUploaded: false,
                vcrTotalBlobs: 2,
            },
            {
                blobId: 'project1/240925_150335/240925_160335/240925_150335-1',
                isUploaded: true,
                vcrTotalBlobs: -1,
            },
            {
                blobId: 'project1/240925_150335/240925_160335/pasDoc_221231_163557/2024_08_31T11_34_55.102Z.txt-1',
                isUploaded: true,
                vcrTotalBlobs: -1,
            }
        ]
        const result = transformBlobFilePathsToBlobInfo(blobsPath, blobFilePaths)
        expect(result).toEqual(expected)

        // handle windows style paths as well
        const blobFilePaths2 = blobFilePaths.map((filePath) => win32.normalize(filePath))
        const result2 = transformBlobFilePathsToBlobInfo(blobsPath, blobFilePaths2)
        expect(result2).toEqual(expected)
    })
})

describe('handleRetrieveAllBlobIds', () => {
    let tempDir: string

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'test-'))
    })

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true })
    })

    it('should return blob IDs for valid blob files', async () => {
        const clientId = '1234'
        const blobsPath = tempDir
        await mkdir(blobsPath, { recursive: true })
        const uploadQueuePath = join(blobsPath, UPLOAD_QUEUE_FOLDER, '2')

        const validVideoBlob = join(blobsPath, '240925_150335-1')
        const validVideoBlob2 = join(blobsPath, '240925_150335-2')
        const duplicateBlob = join(uploadQueuePath, '240925_150335-1')
        const uploadQueueBlob = join(uploadQueuePath, '240925_150405-1')
        const validPasDocBlob = join(blobsPath, 'pasDoc_221231_163557/2024_08_31T11_34_55.102Z.txt-1')
        const invalidFile = join(blobsPath, 'invalid_file.txt')

        await mkdir(uploadQueuePath, { recursive: true })
        await mkdir(join(blobsPath, 'pasDoc_221231_163557'), { recursive: true })
        await writeFile(validVideoBlob, 'video blob content')
        await writeFile(validVideoBlob2, 'video blob content 2')
        await writeFile(duplicateBlob, 'duplicate blob content')
        await writeFile(uploadQueueBlob, 'upload queue blob content')
        await writeFile(validPasDocBlob, 'pasDoc blob content')
        await writeFile(invalidFile, 'invalid file content')

        const result = await handleRetrieveAllBlobIds(tempDir, { clientId })
        expect(result).toEqual([
            { blobId: '240925_150335-1', isUploaded: true, vcrTotalBlobs: -1 }, /* preferred duplicate */
            { blobId: '240925_150335-2', isUploaded: true, vcrTotalBlobs: -1 },
            { blobId: 'pasDoc_221231_163557/2024_08_31T11_34_55.102Z.txt-1', isUploaded: true, vcrTotalBlobs: -1 },
            { blobId: '240925_150405-1', isUploaded: false, vcrTotalBlobs: 2 },
        ])
    })

    it('should return an empty array if the client directory does not exist', async () => {
        const clientId = '5678'
        const result = await handleRetrieveAllBlobIds(tempDir, { clientId })
        expect(result).toEqual([])
    })
})

describe('handleUpdateBlobUploadedStatus', () => {
    let tempDir: string

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'test-'))
    })

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true })
    })

    it('should throw an error if trying to set isUploaded to false for an already uploaded blob', async () => {
        const blobsPath = tempDir
        const blobId = 'project1/blob-1'
        const uploadedBlobPath = join(blobsPath, blobId)

        await mkdir(join(blobsPath, 'project1'), { recursive: true })
        await writeFile(uploadedBlobPath, 'uploaded blob content')

        await expect(
            handleUpdateBlobUploadedStatus(blobsPath, { clientId: 'client1',  blobId, isUploaded: false, vcrTotalBlobs: 0 })
        ).rejects.toThrow(`Blob ${blobId} is already uploaded. Cannot set isUploaded to false.`)
    })

    it('should move a blob from the upload queue to the project folder when setting isUploaded to true', async () => {
        const blobsPath = tempDir
        const blobId = 'project1/blob-1'
        const vcrTotalBlobs = 2
        const uploadQueuePath = join(blobsPath, UPLOAD_QUEUE_FOLDER, String(vcrTotalBlobs), blobId)
        const projectFolderPath = join(blobsPath, 'project1/blob-1')

        await mkdir(join(blobsPath, UPLOAD_QUEUE_FOLDER, String(vcrTotalBlobs), 'project1'), { recursive: true })
        await writeFile(uploadQueuePath, 'blob content in upload queue')

        const result = await handleUpdateBlobUploadedStatus(blobsPath, { clientId: 'client1', blobId, isUploaded: true, vcrTotalBlobs })
        expect(result.ok).toBe(true)

        // Ensure the file was moved
        await expect(rename(uploadQueuePath, projectFolderPath)).rejects.toThrow()
        const movedBlobContent = await readFile(projectFolderPath, 'utf-8')
        expect(movedBlobContent).toBe('blob content in upload queue')
    })

    it('should do nothing if the blob is already in the correct state', async () => {
        const blobsPath = tempDir
        const blobId = 'project1/blob-1'
        const uploadedBlobPath = join(blobsPath, blobId)

        await mkdir(join(blobsPath, 'project1'), { recursive: true })
        await writeFile(uploadedBlobPath, 'uploaded blob content')

        const result = await handleUpdateBlobUploadedStatus(blobsPath, { clientId: 'client1', blobId, isUploaded: true, vcrTotalBlobs: 0 })
        expect(result.ok).toBe(true)

        const blobContent = await readFile(uploadedBlobPath, 'utf-8')
        expect(blobContent).toBe('uploaded blob content')
    })
})

describe('handleStoreBlob', () => {
    let tempDir: string

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'test-'))
    })

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true })
    })

    it('should store a new blob in the uploaded folder when isUploaded is true', async () => {
        const blobsPath = tempDir
        const blobId = 'project1/blob-1'
        const fileContent = 'new uploaded blob content'
        const filePath = join(blobsPath, 'temp-file')

        await writeFile(filePath, fileContent)

        const args: HandleStoreBlobArgs = {
            clientId: 'client1',
            blobId,
            file: { path: filePath } as unknown as File,
            isUploaded: true,
            vcrTotalBlobs: 0,
        }

        const result = await handleStoreBlob(blobsPath, args)
        expect(result.fullPath).toBe(join(blobsPath, 'project1/blob-1'))
        expect(result.isUploaded).toBe(true)

        const storedContent = await readFile(result.fullPath, 'utf-8')
        expect(storedContent).toBe(fileContent)
    })

    it('should store a new blob in the upload queue folder when isUploaded is false', async () => {
        const blobsPath = tempDir
        const blobId = 'project1/blob-1'
        const fileContent = 'new queued blob content'
        const filePath = join(blobsPath, 'temp-file')

        await writeFile(filePath, fileContent)

        const args: HandleStoreBlobArgs = {
            clientId: 'client1',
            blobId,
            file: { path: filePath } as unknown as File,
            isUploaded: false,
            vcrTotalBlobs: 2,
        }

        const result = await handleStoreBlob(blobsPath, args)
        expect(result.fullPath).toBe(join(blobsPath, UPLOAD_QUEUE_FOLDER, '2', 'project1/blob-1'))
        expect(result.isUploaded).toBe(false)

        const storedContent = await readFile(result.fullPath, 'utf-8')
        expect(storedContent).toBe(fileContent)
    })

    it('should throw an error if the file cannot be copied', async () => {
        const blobsPath = tempDir
        const blobId = 'project1/blob-1'
        const invalidFilePath = join(blobsPath, 'non-existent-file')

        const args: HandleStoreBlobArgs = {
            clientId: 'client1',
            blobId,
            file: { path: invalidFilePath } as unknown as File,
            isUploaded: true,
            vcrTotalBlobs: 0,
        }

        await expect(handleStoreBlob(blobsPath, args)).rejects.toThrow()
    })

    it('should return the existing path if the blob already exists with the same isUploaded status', async () => {
        const blobsPath = tempDir
        const blobId = 'project1/blob-1'
        const fileContent = 'existing blob content'
        const existingBlobPath = join(blobsPath, 'project1/blob-1')

        await mkdir(join(blobsPath, 'project1'), { recursive: true })
        await writeFile(existingBlobPath, fileContent)

        const args: HandleStoreBlobArgs = {
            clientId: 'client1',
            blobId,
            file: { path: existingBlobPath } as unknown as File,
            isUploaded: true,
            vcrTotalBlobs: 0,
        }

        const result = await handleStoreBlob(blobsPath, args)
        expect(result.fullPath).toBe(existingBlobPath)
        expect(result.isUploaded).toBe(true)

        const storedContent = await readFile(result.fullPath, 'utf-8')
        expect(storedContent).toBe(fileContent)
    })

    it('should return the existing path if the blob already exists as uploaded and isUploaded is set to false', async () => {
        const blobsPath = tempDir
        const blobId = 'project1/blob-1'
        const fileContent = 'existing uploaded blob content'
        const existingBlobPath = join(blobsPath, 'project1/blob-1')

        await mkdir(join(blobsPath, 'project1'), { recursive: true })
        await writeFile(existingBlobPath, fileContent)

        const args: HandleStoreBlobArgs = {
            clientId: 'client1',
            blobId,
            file: { path: existingBlobPath } as unknown as File,
            isUploaded: false,
            vcrTotalBlobs: 0,
        }

        const result = await handleStoreBlob(blobsPath, args)
        expect(result.fullPath).toBe(existingBlobPath)
        expect(result.isUploaded).toBe(true)

        const storedContent = await readFile(result.fullPath, 'utf-8')
        expect(storedContent).toBe(fileContent)
    })

    it('should move the blob from the upload queue to the uploaded folder if isUploaded is set to true', async () => {
        const blobsPath = tempDir
        const blobId = 'project1/blob-1'
        const fileContent = 'blob content in upload queue'
        const uploadQueuePath = join(blobsPath, UPLOAD_QUEUE_FOLDER, '2', 'project1/blob-1')
        const uploadedBlobPath = join(blobsPath, 'project1/blob-1')

        await mkdir(join(blobsPath, UPLOAD_QUEUE_FOLDER, '2', 'project1'), { recursive: true })
        await writeFile(uploadQueuePath, fileContent)

        const args: HandleStoreBlobArgs = {
            clientId: 'client1',
            blobId,
            file: { path: uploadQueuePath } as unknown as File,
            isUploaded: true,
            vcrTotalBlobs: 2,
        }

        const result = await handleStoreBlob(blobsPath, args)
        expect(result.fullPath).toBe(uploadedBlobPath)
        expect(result.isUploaded).toBe(true)

        const storedContent = await readFile(uploadedBlobPath, 'utf-8')
        expect(storedContent).toBe(fileContent)
    })
})

describe('buildBlobPath', () => {
    it('should build the correct path for uploaded blobs', () => {
        const blobsPath = '/base/path'
        const blobId = 'project1/blob-1'
        const isUploaded = true
        const vcrTotalBlobs = 0

        const result = buildBlobPath(blobsPath, blobId, isUploaded, vcrTotalBlobs)
        expect(result).toBe(win32.normalize('/base/path/project1/blob-1'))
    })

    it('should build the correct path for blobs in the upload queue', () => {
        const blobsPath = '/base/path'
        const blobId = 'project1/blob-1'
        const isUploaded = false
        const vcrTotalBlobs = 2

        const result = buildBlobPath(blobsPath, blobId, isUploaded, vcrTotalBlobs)
        expect(result).toBe(win32.normalize('/base/path/__uploadQueue/2/project1/blob-1'))
    })
})

describe('getBlobInfo', () => {
    let tempDir: string

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'test-'))
    })

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true })
    })

    it('should return the correct path and isUploaded=true for an uploaded blob', async () => {
        const blobsPath = tempDir
        const blobId = 'project1/blob-1'
        const vcrTotalBlobs = 0
        const uploadedBlobPath = join(blobsPath, 'project1/blob-1')

        await mkdir(join(blobsPath, 'project1'), { recursive: true })
        await writeFile(uploadedBlobPath, 'uploaded blob content')

        const result = await getBlobInfo(blobsPath, blobId, vcrTotalBlobs)
        expect(result).toEqual({ fullPath: uploadedBlobPath, isUploaded: true })
    })

    it('should return the correct path and isUploaded=false for a blob in the upload queue', async () => {
        const blobsPath = tempDir
        const blobId = 'project1/blob-1'
        const vcrTotalBlobs = 2
        const uploadQueuePath = join(blobsPath, UPLOAD_QUEUE_FOLDER, String(vcrTotalBlobs), 'project1/blob-1')

        await mkdir(join(blobsPath, UPLOAD_QUEUE_FOLDER, String(vcrTotalBlobs), 'project1'), { recursive: true })
        await writeFile(uploadQueuePath, 'blob content in upload queue')

        const result = await getBlobInfo(blobsPath, blobId, vcrTotalBlobs)
        expect(result).toEqual({ fullPath: uploadQueuePath, isUploaded: false })
    })

    it('should return the uploaded path if also in upload queue', async () => {
        const blobsPath = tempDir
        const blobId = 'project1/blob-1'
        const vcrTotalBlobs = 2
        const uploadQueuePath = join(blobsPath, UPLOAD_QUEUE_FOLDER, String(vcrTotalBlobs), 'project1/blob-1')

        await mkdir(join(blobsPath, UPLOAD_QUEUE_FOLDER, String(vcrTotalBlobs), 'project1'), { recursive: true })
        await writeFile(uploadQueuePath, 'blob content in upload queue')

        const uploadedBlobPath = join(blobsPath, 'project1/blob-1')

        await mkdir(join(blobsPath, 'project1'), { recursive: true })
        await writeFile(uploadedBlobPath, 'uploaded blob content')

        const result = await getBlobInfo(blobsPath, blobId, vcrTotalBlobs)
        expect(result).toEqual({ fullPath: uploadedBlobPath, isUploaded: true })
    })

    it('should throw an error if the blob does not exist', async () => {
        const blobsPath = tempDir
        const blobId = 'project1/blob-1'
        const vcrTotalBlobs = 2
        const uploadQueuePath = join(blobsPath, UPLOAD_QUEUE_FOLDER, String(vcrTotalBlobs), blobId)

        await expect(getBlobInfo(blobsPath, blobId, vcrTotalBlobs)).rejects.toThrow(`ENOENT: no such file or directory, access '${uploadQueuePath}`)
    })
})

describe('handleRetrieveBlobInfo', () => {
    let tempDir: string

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'test-'))
    })

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true })
    })

    it('should return the correct path and isUploaded=true for an uploaded blob', async () => {
        const blobsPath = tempDir
        const blobId = 'project1/blob-1'
        const vcrTotalBlobs = 0
        const uploadedBlobPath = join(blobsPath, 'project1/blob-1')

        await mkdir(join(blobsPath, 'project1'), { recursive: true })
        await writeFile(uploadedBlobPath, 'uploaded blob content')

        const result = await handleRetrieveBlobInfo(blobsPath, { clientId: '1234', blobId, vcrTotalBlobs })
        expect(result).toEqual({ fullPath: uploadedBlobPath, isUploaded: true })
    })

    it('should return the correct path and isUploaded=false for a blob in the upload queue', async () => {
        const blobsPath = tempDir
        const blobId = 'project1/blob-1'
        const vcrTotalBlobs = 2
        const uploadQueuePath = join(blobsPath, UPLOAD_QUEUE_FOLDER, String(vcrTotalBlobs), 'project1/blob-1')

        await mkdir(join(blobsPath, UPLOAD_QUEUE_FOLDER, String(vcrTotalBlobs), 'project1'), { recursive: true })
        await writeFile(uploadQueuePath, 'blob content in upload queue')

        const result = await handleRetrieveBlobInfo(blobsPath, { clientId: '1234', blobId, vcrTotalBlobs })
        expect(result).toEqual({ fullPath: uploadQueuePath, isUploaded: false })
    })

    it('should return an empty path and isUploaded=false if the blob does not exist', async () => {
        const blobsPath = tempDir
        const blobId = 'project1/blob-1'
        const vcrTotalBlobs = 2

        const result = await handleRetrieveBlobInfo(blobsPath, { clientId: '1234', blobId, vcrTotalBlobs })
        expect(result).toEqual({ fullPath: '', isUploaded: false })
    })
})

describe('cleanupUploadQueueFolder', () => {
    let tempDir: string

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'test-'))
    })

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true })
    })

    it('should ensure the upload queue folder exists', async () => {
        const blobsPath = tempDir
        const uploadQueuePath = join(blobsPath, UPLOAD_QUEUE_FOLDER)

        await cleanupUploadQueueFolder(blobsPath)

        // Ensure the upload queue folder is created
        await expect(pathExists(uploadQueuePath)).resolves.toBe(true)
    })

    it('should delete duplicate files in the upload queue', async () => {
        const blobsPath = tempDir
        const blobId = 'project1/blob-1'
        const vcrTotalBlobs = 2
        const uploadedBlobPath = buildBlobPath(blobsPath, blobId, true, vcrTotalBlobs)
        const uploadQueueBlobPath = buildBlobPath(blobsPath, blobId, false, vcrTotalBlobs)

        await mkdir(join(blobsPath, 'project1'), { recursive: true })
        await writeFile(uploadedBlobPath, 'uploaded blob content')

        await mkdir(join(blobsPath, UPLOAD_QUEUE_FOLDER, String(vcrTotalBlobs), 'project1'), { recursive: true })
        await writeFile(uploadQueueBlobPath, 'duplicate blob content')

        await cleanupUploadQueueFolder(blobsPath)

        // Ensure the duplicate file in the upload queue is deleted
        await expect(access(uploadQueueBlobPath)).rejects.toThrow()
        // Ensure the uploaded file is not deleted
        const uploadedContent = await readFile(uploadedBlobPath, 'utf-8')
        expect(uploadedContent).toBe('uploaded blob content')
    })

    it('should delete empty folders in the upload queue', async () => {
        const blobsPath = tempDir
        const emptyFolderPath = join(blobsPath, UPLOAD_QUEUE_FOLDER, '2', 'empty-folder')
        const topLevelFolder = join(blobsPath, UPLOAD_QUEUE_FOLDER, '2')

        await mkdir(emptyFolderPath, { recursive: true })

        await cleanupUploadQueueFolder(blobsPath)

        // Ensure the empty folder is deleted
        await expect(access(topLevelFolder)).rejects.toThrow()
    })

    it('should not delete non-empty folders in the upload queue', async () => {
        const blobsPath = tempDir
        const nonEmptyFolderPath = join(blobsPath, UPLOAD_QUEUE_FOLDER, '2', 'non-empty-folder')
        const filePath = join(nonEmptyFolderPath, 'file.txt')

        await mkdir(nonEmptyFolderPath, { recursive: true })
        await writeFile(filePath, 'content')

        await cleanupUploadQueueFolder(blobsPath)

        // Ensure the non-empty folder is not deleted
        const fileContent = await readFile(filePath, 'utf-8')
        expect(fileContent).toBe('content')
    })
})
