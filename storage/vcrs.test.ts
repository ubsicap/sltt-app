import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtemp, remove, pathExists, readJson, ensureDir, writeJson } from 'fs-extra'
import { tmpdir } from 'os'
import { listVcrFiles, retrieveVcrs, storeVcr } from './vcrs' // Adjust the import path as needed
import { VideoCacheRecord } from './vcrs.d'

describe('storeVcr', () => {
    let tempDir: string

    beforeEach(async () => {
        // Create a temporary directory for each test
        tempDir = await mkdtemp(join(tmpdir(), 'videoCacheRecords-'))
    })

    afterEach(async () => {
        // Clean up the temporary directory after each test
        await remove(tempDir)
    })

    it('should store the video cache record in the correct file', async () => {
        const clientId = 'testClient'
        const videoCacheRecord = {
            _id: 'BGSL_БЖЕ/230601_064416/230601_065151/240327_114822-2',
            uploadeds: [true, false, true]
        }

        const result = await storeVcr(tempDir, { clientId, videoCacheRecord, batchMaxSize: 0, batchMaxTime: 0 })

        // Check that the result is not null
        expect(result).not.toBeNull()

        const { fullPath } = result!
        const expectedPath = join(tempDir, clientId, 'BGSL_БЖЕ', 'BGSL_БЖЕ__230601_064416.sltt-vcrs')

        // Check that the fullPath is correct
        expect(fullPath).toBe(expectedPath)

        // wait 1500ms for the file to be written
        await new Promise(resolve => setTimeout(resolve, 1500))

        // Check that the file exists
        const exists = await pathExists(fullPath)
        expect(exists).toBe(true)

        // Check the contents of the file
        const fileContents = await readJson(fullPath)
        expect(fileContents).toEqual({
            '230601_065151/240327_114822-2': videoCacheRecord
        })
    })

    it('should update an existing video cache record file', async () => {
        const clientId = 'testClient'
        const videoCacheRecord1 = {
            _id: 'BGSL_БЖЕ/230601_064416/230601_065151/240327_114822-2',
            uploadeds: [true, false, true]
        }
        const videoCacheRecord2 = {
            _id: 'BGSL_БЖЕ/230601_064416/230601_065151/240327_114823-3',
            uploadeds: [false, true, false]
        }

        await storeVcr(tempDir, { clientId, videoCacheRecord: videoCacheRecord1, batchMaxSize: 5, batchMaxTime: 5 })
        const result = await storeVcr(tempDir, { clientId, videoCacheRecord: videoCacheRecord2, batchMaxSize: 5, batchMaxTime: 5 })

        // Check that the result is not null
        expect(result).not.toBeNull()

        const { fullPath } = result!
        const expectedPath = join(tempDir, clientId, 'BGSL_БЖЕ', 'BGSL_БЖЕ__230601_064416.sltt-vcrs')

        // Check that the fullPath is correct
        expect(fullPath).toBe(expectedPath)

        // wait 1500ms for the file to be written
        await new Promise(resolve => setTimeout(resolve, 1500))

        // Check that the file exists
        const exists = await pathExists(fullPath)
        expect(exists).toBe(true)

        // Check the contents of the file
        const fileContents = await readJson(fullPath)
        expect(fileContents).toEqual({
            '230601_065151/240327_114822-2': videoCacheRecord1,
            '230601_065151/240327_114823-3': videoCacheRecord2
        })
    })

    it('should handle changes to multiple paths', async () => {
        const clientId = 'testClient'
        const portion1videoCacheRecord1 = {
            _id: 'BGSL_БЖЕ/230601_064416/230601_065151/240327_114822-2',
            uploadeds: [true, false, true]
        }
        const portion1videoCacheRecord2 = {
            _id: 'BGSL_БЖЕ/230601_064416/230601_065151/240327_114823-3',
            uploadeds: [false, true, false]
        }
        const portion2videoCacheRecord3 = {
            _id: 'BGSL_БЖЕ/230601_064417/230601_065152/240327_114824-4',
            uploadeds: [true, true, true]
        }

        // Store records in different paths
        const path1 = await storeVcr(tempDir, { clientId, videoCacheRecord: portion1videoCacheRecord1, batchMaxSize: 5, batchMaxTime: 5 })
        const path2 = await storeVcr(tempDir, { clientId, videoCacheRecord: portion2videoCacheRecord3, batchMaxSize: 5, batchMaxTime: 5 })
        const path3 = await storeVcr(tempDir, { clientId, videoCacheRecord: portion1videoCacheRecord2, batchMaxSize: 5, batchMaxTime: 5 })

        // Check that the result is not null
        expect(path1).not.toBeNull()
        expect(path2).not.toBeNull()
        expect(path3).not.toBeNull()
        expect(path1!.fullPath).not.toBe(path2!.fullPath)
        expect(path1!.fullPath).toBe(path3!.fullPath)

        const expectedPath1 = join(tempDir, clientId, 'BGSL_БЖЕ', 'BGSL_БЖЕ__230601_064416.sltt-vcrs')
        const expectedPath2 = join(tempDir, clientId, 'BGSL_БЖЕ', 'BGSL_БЖЕ__230601_064417.sltt-vcrs')

        // wait 1500ms for the files to be written
        await new Promise(resolve => setTimeout(resolve, 1500))

        // Check that the files exist
        const exists1 = await pathExists(expectedPath1)
        const exists2 = await pathExists(expectedPath2)
        expect(exists1).toBe(true)
        expect(exists2).toBe(true)

        // Check the contents of the first file
        const fileContents1 = await readJson(expectedPath1)
        expect(fileContents1).toEqual({
            '230601_065151/240327_114822-2': portion1videoCacheRecord1,
            '230601_065151/240327_114823-3': portion1videoCacheRecord2
        })

        // Check the contents of the second file
        const fileContents2 = await readJson(expectedPath2)
        expect(fileContents2).toEqual({
            '230601_065152/240327_114824-4': portion2videoCacheRecord3
        })
    })
})

describe('listVcrFiles', () => {
    let tempDir: string

    beforeEach(async () => {
        // Create a temporary directory for each test
        tempDir = await mkdtemp(join(tmpdir(), 'videoCacheRecords-'))
    })

    afterEach(async () => {
        // Clean up the temporary directory after each test
        await remove(tempDir)
    })

    it('should list VCR files', async () => {
        const clientId = 'testClient'
        const project = 'testProject'
        const filename1 = 'testProject__file1.sltt-vcrs'
        const filename2 = 'testProject__file2.sltt-vcrs'

        const fullClientPath = join(tempDir, clientId, project)
        await ensureDir(fullClientPath)

        // Create dummy VCR files
        await writeJson(join(fullClientPath, filename1), {})
        await writeJson(join(fullClientPath, filename2), {})

        const result = await listVcrFiles(tempDir, { clientId, project })

        // Check that the result contains the correct filenames
        expect(result).toEqual([filename1, filename2])
    })

    it('should handle empty project in listVcrFiles', async () => {
        const clientId = 'testClient'
        const project = ''
        const filename1 = 'testProject1__file1.sltt-vcrs'
        const filename2 = 'testProject2__file2.sltt-vcrs'

        const fullClientPath1 = join(tempDir, clientId, 'testProject1')
        const fullClientPath2 = join(tempDir, clientId, 'testProject2')
        await ensureDir(fullClientPath1)
        await ensureDir(fullClientPath2)

        // Create dummy VCR files
        await writeJson(join(fullClientPath1, filename1), {})
        await writeJson(join(fullClientPath2, filename2), {})

        const result = await listVcrFiles(tempDir, { clientId, project })

        // Check that the result contains the correct filenames
        expect(result).toEqual([filename1, filename2])
    })
})

describe('retrieveVcrs', () => {
    let tempDir: string

    beforeEach(async () => {
        // Create a temporary directory for each test
        tempDir = await mkdtemp(join(tmpdir(), 'videoCacheRecords-'))
    })

    afterEach(async () => {
        // Clean up the temporary directory after each test
        await remove(tempDir)
    })

    it('should retrieve VCRs', async () => {
        const clientId = 'testClient'
        const project = 'testProject'
        const filename = 'testProject__file1.sltt-vcrs'
        const videoCacheRecord: VideoCacheRecord = {
            _id: 'some-id',
            uploadeds: [true, false, true]
        }

        const fullClientPath = join(tempDir, clientId, project)
        await ensureDir(fullClientPath)

        // Create a dummy VCR file
        await writeJson(join(fullClientPath, filename), { 'some-id': videoCacheRecord })

        const result = await retrieveVcrs(tempDir, { clientId, filename })

        // Check that the result contains the correct video cache record
        expect(result).toEqual({ 'some-id': videoCacheRecord })
    })

    it('should return null for non-existent VCR file in retrieveVcrs', async () => {
        const clientId = 'testClient'
        const filename = 'nonExistentProject__file1.sltt-vcrs'

        const result = await retrieveVcrs(tempDir, { clientId, filename })

        // Check that the result is null
        expect(result).toBeNull()
    })

})
