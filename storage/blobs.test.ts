import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { filterBlobFiles, handleRetrieveAllBlobIds, transformBlobFilePathsToBlobIds } from './blobs'
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

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
            '/base/path/project1/240925_150335/240925_160335/240925_150335-1',
            '/base/path/project1/240925_150335/240925_160335/pasDoc_221231_163557/2024_08_31T11_34_55.102Z.txt-1'
        ]
        const expected = [
            'project1/240925_150335/240925_160335/240925_150335-1',
            'project1/240925_150335/240925_160335/pasDoc_221231_163557/2024_08_31T11_34_55.102Z.txt-1'
        ]
        const result = transformBlobFilePathsToBlobIds(blobsPath, blobFilePaths)
        expect(result).toEqual(expected)
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

        const validVideoBlob = join(blobsPath, '240925_150335-1')
        const validPasDocBlob = join(blobsPath, 'pasDoc_221231_163557/2024_08_31T11_34_55.102Z.txt-1')
        const invalidFile = join(blobsPath, 'invalid_file.txt')

        await mkdir(join(blobsPath, 'pasDoc_221231_163557'), { recursive: true })
        await writeFile(validVideoBlob, 'video blob content')
        await writeFile(validPasDocBlob, 'pasDoc blob content')
        await writeFile(invalidFile, 'invalid file content')

        const result = await handleRetrieveAllBlobIds(tempDir, { clientId })
        expect(result).toEqual([
            '240925_150335-1',
            'pasDoc_221231_163557/2024_08_31T11_34_55.102Z.txt-1'
        ])
    })

    it('should return an empty array if the client directory does not exist', async () => {
        const clientId = '5678'
        const result = await handleRetrieveAllBlobIds(tempDir, { clientId })
        expect(result).toEqual([])
    })
})
