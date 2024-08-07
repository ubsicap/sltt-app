import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { mkdtempSync, rmdirSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { handleListDocs, handleRetrieveDoc, handleStoreDoc } from './docs'

let tempDir: string

beforeEach(() => {
  // Create a unique temporary directory
  tempDir = mkdtempSync(join(tmpdir(), 'sltt-app-vitest-'))
})

afterEach(() => {
  // Clean up the temporary directory
  rmdirSync(tempDir, { recursive: true })
})

it('should create a temp folder path', () => {
  // Use the tempDir in your tests
  expect(existsSync(tempDir)).toBe(true)
})

describe('handleListDocs', () => {
  it('should list empty docs in empty folder', async () => {
    const project = 'testProject'
    const isFromRemote = false
    const testDataPath = resolve(__dirname, './test-data/listTests/empty')
    const docs = await handleListDocs(testDataPath, { project, isFromRemote })
    expect(docs).toEqual([])
  })
  it('should strip remote docs, but list earlier local docs', async () => {
    const project = 'testProject'
    const isFromRemote = false
    const testDataPath = resolve(__dirname, './test-data/listTests/local-and-remote')
    const docs = await handleListDocs(testDataPath, { project, isFromRemote })
    expect(docs).toEqual([
      'local-doc__2024-07-25_14-50-23-046__210629_180535-240725_145023__c62114c2__c62114c2.sltt-doc',
      'local-doc__2024-07-26_02-58-31-902__210629_180535-240726_025831__c62114c2__c62114c2.sltt-doc',
    ])
  })
  it('should list all remote docs', async () => {
    const project = 'testProject'
    const isFromRemote = true
    const testDataPath = resolve(__dirname, './test-data/listTests/local-and-remote')
    const docs = await handleListDocs(testDataPath, { project, isFromRemote })
    expect(docs).toEqual([
      '000000001__2024-07-25_16-26-36-672__210202_183235-240607_145904-240618_160543-240725_162634__e85c7697__e85c7697.sltt-doc',
    ])
  })
})

describe('handleRetrieveDoc', () => {
  it('should retrieve documents correctly', async () => {
    const project = 'testProject'
    const filename = 'local-doc__2024-07-25_14-50-23-046__210629_180535-240725_145023__c62114c2__c62114c2.sltt-doc'
    const isFromRemote = false
    const testDataPath = resolve(__dirname, './test-data/listTests/local-and-remote')
    const response = await handleRetrieveDoc(testDataPath, { project, isFromRemote, filename })
    expect(response).toBeTruthy()
    const { fullPath } = response!
    const relativePath = fullPath.split('storage').pop() || ''
    const storagePath = join('storage', relativePath)
    const normalizedStoragePath = storagePath.replace(/\\/g, '/')
    expect({
      ...response,
      fullPath: normalizedStoragePath
    }).toMatchSnapshot()
  })

  it.each([
    {
      testCase: 'store remote doc with mod-by',
      project: 'testProject1',
      doc: {     
        modDate: '2024/06/21 06:05:21.444Z',
        _id: '210202_183235/240607_145904',
        creator: 'wendy@example.com',
        modBy: 'bob@example.com',
      },
      remoteSeq: '000000001',
      expectedFilename: '000000001__2024-06-21_06-05-21-444__210202_183235-240607_145904__3de71188__4b9bb806.sltt-doc'
    },
    {
      testCase: 'store local doc',
      project: 'testProject1',
      doc: {
        modDate: '2023/06/21 06:15:21.444Z',
        _id: '310202_183235/340607_145904',
        creator: 'wendy@example.com',
        modBy: 'bob@example.com',
      },
      remoteSeq: '',
      expectedFilename: 'local-doc__2023-06-21_06-15-21-444__310202_183235-340607_145904__3de71188__4b9bb806.sltt-doc'
    }
  ])('should return null for $testCase because files are not found', async ({ project, doc, remoteSeq, expectedFilename }) => {
    const isFromRemote = !remoteSeq
    const testDataPath = resolve(__dirname, './test-data/listTests/local-and-remote')
    const response = await handleRetrieveDoc(testDataPath, { project, isFromRemote, filename: expectedFilename })
    expect(response).toBe(null)
  })
})

describe('handleStoreDoc', () => {
  // Store 3 separate remote and local docs and verify they were saved
  it.each([
    {
      testCase: 'store remote doc with no-mod-by',
      project: 'testProject1',
      doc: {
        modDate: '2023/10/01 12:34:23.046Z',
        _id: '210202_183235/240607_145904',
        creator: 'bob@example.com',
      },
      remoteSeq: 1,
      expectedFilename: '000000001__2023-10-01_12-34-23-046__210202_183235-240607_145904__4b9bb806__no-mod-by.sltt-doc'
    },
    {
      testCase: 'store remote doc with modBy',
      project: 'testProject1',
      doc: {
        modDate: '2023/10/01 12:34:23.046Z',
        _id: '210202_183235/240607_145904',
        creator: 'alice@example.com',
        modBy: 'bob@example.com',
      },
      remoteSeq: 1,
      expectedFilename: '000000001__2023-10-01_12-34-23-046__210202_183235-240607_145904__c160f8cc__4b9bb806.sltt-doc'
    },
    {
      testCase: 'store local doc',
      project: 'testProject2',
      doc: {
        modDate: '2023/11/01 13:34:23.046Z',
        _id: '310202_183235/340607_145904',
        creator: 'alice@example.com',
        modBy: 'bob@example.com',
      },
      remoteSeq: Number.NaN,
      expectedFilename: 'local-doc__2023-11-01_13-34-23-046__310202_183235-340607_145904__c160f8cc__4b9bb806.sltt-doc'
    }
  ])('should handle document storage correctly for $testCase', async ({ project, doc, remoteSeq, expectedFilename }) => {
    const response = await handleStoreDoc(tempDir, { project, doc, remoteSeq })

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
  })

  it('should delete local doc after its remote is stored', async () => {
    const project = 'testProject1'
    const doc = {
      modDate: '2024/06/29 11:35:22.044Z',
      _id: '210202_183235/240607_145904',
      creator: 'wendy@example.com',
    }
    const expectedFilename1 = 'local-doc__2024-06-29_11-35-22-044__210202_183235-240607_145904__3de71188__no-mod-by.sltt-doc'
    const expectedFilename2 = '000000001__2024-06-29_11-35-22-044__210202_183235-240607_145904__3de71188__no-mod-by.sltt-doc'
    const firstStoreResponse = await handleStoreDoc(tempDir, { project, doc, remoteSeq: Number.NaN })
    const { projectPath, normalizedFilename } = firstStoreResponse
    const localPath = join(tempDir, projectPath, normalizedFilename)
    const localFileExists = existsSync(localPath)
    expect(localFileExists).toBe(true)
    expect(firstStoreResponse.freshlyWritten).toBe(true)
    expect(firstStoreResponse.normalizedFilename).toBe(expectedFilename1)

    const secondStoreResponse = await handleStoreDoc(tempDir, { project, doc, remoteSeq: 1 })
    const { projectPath: projectPath2, normalizedFilename: normalizedFilename2 } = secondStoreResponse
    const remotePath = join(tempDir, projectPath2, normalizedFilename2)
    const remoteFileExists = existsSync(remotePath)
    expect(remoteFileExists).toBe(true)
    expect(secondStoreResponse.freshlyWritten).toBe(true)
    expect(secondStoreResponse.normalizedFilename).toBe(expectedFilename2)
    const localFileExists2 = existsSync(localPath)
    expect(localFileExists2).toBe(false)
  })

  it('should not store the same doc twice', async () => {
    const project = 'testProject1'
    const doc = {
      modDate: '2024/07/30 12:34:23.046Z',
      _id: '210202_183235/240607_145904',
      creator: 'ellis@example.com',
    }
    const expectedFilename = 'local-doc__2024-07-30_12-34-23-046__210202_183235-240607_145904__8cf5a227__no-mod-by.sltt-doc'

    const firstStoreResponse = await handleStoreDoc(tempDir, { project, doc, remoteSeq: Number.NaN })
    expect(firstStoreResponse.freshlyWritten).toBe(true)
    expect(firstStoreResponse.normalizedFilename).toBe(expectedFilename)

    const secondStoreResponse = await handleStoreDoc(tempDir, { project, doc, remoteSeq: Number.NaN })
    expect(secondStoreResponse.freshlyWritten).toBe(false)
    expect(secondStoreResponse.normalizedFilename).toBe(expectedFilename)
  })
})
