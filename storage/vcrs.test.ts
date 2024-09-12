import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtemp, remove, pathExists, readJson } from 'fs-extra'
import { tmpdir } from 'os'
import { storeVcr } from './vcrs' // Adjust the import path as needed

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

        const result = await storeVcr(tempDir, clientId, videoCacheRecord)

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

        await storeVcr(tempDir, clientId, videoCacheRecord1)
        const result = await storeVcr(tempDir, clientId, videoCacheRecord2)

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
})