import { describe, it, expect, test, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmdirSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { handleListDocs, handleRetrieveDoc, handleStoreDoc } from './docs'

// Basic test to ensure Jest is working
test('basic test', () => {
  expect(1 + 1).toBe(2)
})

let tempDir: string;

beforeAll(() => {
  // Create a unique temporary directory
  tempDir = mkdtempSync(join(tmpdir(), 'vitest-'))
})

afterAll(() => {
  // Clean up the temporary directory
  rmdirSync(tempDir, { recursive: true })
})

it('should create a temp folder path', () => {
  // Use the tempDir in your tests
  expect(existsSync(tempDir)).toBe(true);
})

describe('handleListDocs', () => {
  it('should list documents correctly', async () => {
    const project = 'testProject'
    const isFromRemote = false
    const testDataPath = resolve(__dirname, './test-data/listTests/empty')
    const docs = await handleListDocs(testDataPath, project, isFromRemote)
    expect(docs).toEqual([])
  })
})

describe('handleRetrieveDoc', () => {
  it('should retrieve documents correctly', async () => {
    const project = 'testProject'
    const filename = 'local-doc__2024-07-25_14-50-23-046__210629_180535-240725_145023__c62114c2__c62114c2.sltt-doc'
    const isFromRemote = false
    const testDataPath = resolve(__dirname, './test-data/listTests/local-and-remote')
    const response = await handleRetrieveDoc(testDataPath, project, isFromRemote, filename)
    expect(response).toMatchSnapshot()
  })
})

describe('handleStoreDoc', () => {
  it('should handle document storage correctly', async () => {
    const project = 'testProject';
    const doc = {
      modDate: '2023/10/01 12:34:23.046Z',
      _id: '210202_183235/240607_145904',
      creator: 'bob@example.com',
    };

    const remoteSeq = 'local-doc';
    const response = await handleStoreDoc(tempDir, project, doc, remoteSeq)

    // Correct the date formatting
    const expectedFilename = `local-doc__2023-10-01_12-34-23-046__210202_183235-240607_145904__4b9bb806__no-mod-by.sltt-doc`

    // Split the filename correctly
    const parts = expectedFilename.split('__');

    const [expectedRemoteSeq, expectedFilenameModDate, expectedFilenameId, expectedFilenameCreator] = parts
    const expectedFilenameModBy = 'no-mod-by'  

    expect(response).toEqual({
      normalizedFilename: expectedFilename,
      remoteSeq: expectedRemoteSeq,
      filenameModDate: expectedFilenameModDate,
      filenameId: expectedFilenameId,
      filenameCreator: expectedFilenameCreator,
      filenameModBy: expectedFilenameModBy,
      freshlyWritten: true
    })
  })
})
