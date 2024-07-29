import { describe, it, expect, test, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmdirSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { handleListDocs, handleRetrieveDoc, handleStoreDoc } from './docs'

// Basic test to ensure Jest is working
test('basic test', () => {
  expect(1 + 1).toBe(2)
})

let tempDir: string

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
  expect(existsSync(tempDir)).toBe(true)
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
  it.each([
    {
      testCase: 'local doc with no-mod-by',
      project: 'testProject1',
      doc: {
        modDate: '2023/10/01 12:34:23.046Z',
        _id: '210202_183235/240607_145904',
        creator: 'bob@example.com',
      },
      remoteSeq: '',
      expectedFilename: 'local-doc__2023-10-01_12-34-23-046__210202_183235-240607_145904__4b9bb806__no-mod-by.sltt-doc'
    },
    {
      testCase: 'local doc with modBy',
      project: 'testProject1',
      doc: {
        modDate: '2023/10/01 12:34:23.046Z',
        _id: '210202_183235/240607_145904',
        creator: 'alice@example.com',
        modBy: 'bob@example.com',
      },
      remoteSeq: '',
      expectedFilename: 'local-doc__2023-10-01_12-34-23-046__210202_183235-240607_145904__c160f8cc__4b9bb806.sltt-doc'
    },
    {
      testCase: 'remote doc',
      project: 'testProject2',
      doc: {
        modDate: '2023/11/01 13:34:23.046Z',
        _id: '310202_183235/340607_145904',
        creator: 'alice@example.com',
        modBy: 'bob@example.com',
      },
      remoteSeq: '000000001',
      expectedFilename: '000000001__2023-11-01_13-34-23-046__310202_183235-340607_145904__c160f8cc__4b9bb806.sltt-doc'
    }
  ])('should handle document storage correctly for $testCase', async ({ project, doc, remoteSeq, expectedFilename }) => {
    try {
      const response = await handleStoreDoc(tempDir, project, doc, remoteSeq)

      // Split the filename correctly
      const parts = expectedFilename.split('.')[0].split('__')
      const [expectedRemoteSeq, expectedFilenameModDate, expectedFilenameId, expectedFilenameCreator, expectedFilenameModBy] = parts
      const projectPath = `${project}/${!remoteSeq ? 'local' : 'remote'}`
      expect(response).toEqual({
        projectPath,
        normalizedFilename: expectedFilename,
        remoteSeq: expectedRemoteSeq,
        filenameModDate: expectedFilenameModDate,
        filenameId: expectedFilenameId,
        filenameCreator: expectedFilenameCreator,
        filenameModBy: expectedFilenameModBy,
        freshlyWritten: true
      })
    } catch (error) {
      console.error('Test failed with the following error:')
      console.error(`Project: ${project}`)
      console.error(`Document: ${doc}`)
      console.error(`Remote Sequence: ${remoteSeq}`)
      console.error(`Expected Filename: ${expectedFilename}`)
      console.error('Error details:', error)
      throw error // Re-throw the error to ensure the test still fails
    }
  })
})
