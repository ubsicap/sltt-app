import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { handleRetrieveRemoteDocs, handleListDocsV0, handleRetrieveDocV0, handleStoreDocV0, handleStoreRemoteDocs, IDBModDoc, handleStoreLocalDocs, handleRetrieveLocalClientDocs, EMPTY_STATUS, handleGetStoredLocalClientIds, handleSaveRemoteSpots, handleGetRemoteSpots, handleSaveLocalSpots, handleGetLocalSpots } from './docs'
import { appendFile, mkdtemp, readFile, stat, writeFile } from 'fs/promises'
import { ensureDir, readJson, remove, writeJson } from 'fs-extra'
import { GetStoredLocalClientIdsArgs, GetStoredLocalClientIdsResponse, LocalSpot, RetrieveLocalClientDocsArgs, RetrieveLocalClientDocsResponse, RetrieveRemoteDocsResponse, SaveLocalSpotsArgs, SaveRemoteSpotsArgs, StoreLocalDocsArgs, StoreRemoteDocsArgs, StoreRemoteDocsResponse } from './docs.d'

let tempDir: string

beforeEach(async () => {
  // Create a temporary directory for each test
  tempDir = await mkdtemp(join(tmpdir(), 'docs-'))
})

afterEach(async () => {
  // Clean up the temporary directory after each test
  await remove(tempDir)
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
    const docs = await handleListDocsV0(testDataPath, { project, isFromRemote })
    expect(docs).toEqual([])
  })
  it('should strip remote docs, but list earlier local docs', async () => {
    const project = 'testProject'
    const isFromRemote = false
    const testDataPath = resolve(__dirname, './test-data/listTests/local-and-remote')
    const docs = await handleListDocsV0(testDataPath, { project, isFromRemote })
    expect(docs).toEqual([
      'local-doc__2024-07-25_14-50-23-046__210629_180535-240725_145023__c62114c2__c62114c2.sltt-doc',
      'local-doc__2024-07-26_02-58-31-902__210629_180535-240726_025831__c62114c2__c62114c2.sltt-doc',
    ])
  })
  it('should list all remote docs', async () => {
    const project = 'testProject'
    const isFromRemote = true
    const testDataPath = resolve(__dirname, './test-data/listTests/local-and-remote')
    const docs = await handleListDocsV0(testDataPath, { project, isFromRemote })
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
    const response = await handleRetrieveDocV0(testDataPath, { project, isFromRemote, filename })
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
    const response = await handleRetrieveDocV0(testDataPath, { project, isFromRemote, filename: expectedFilename })
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
    const response = await handleStoreDocV0(tempDir, { project, doc, remoteSeq })

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
    const firstStoreResponse = await handleStoreDocV0(tempDir, { project, doc, remoteSeq: Number.NaN })
    const { projectPath, normalizedFilename } = firstStoreResponse
    const localPath = join(tempDir, projectPath, normalizedFilename)
    const localFileExists = existsSync(localPath)
    expect(localFileExists).toBe(true)
    expect(firstStoreResponse.freshlyWritten).toBe(true)
    expect(firstStoreResponse.normalizedFilename).toBe(expectedFilename1)

    const secondStoreResponse = await handleStoreDocV0(tempDir, { project, doc, remoteSeq: 1 })
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

    const firstStoreResponse = await handleStoreDocV0(tempDir, { project, doc, remoteSeq: Number.NaN })
    expect(firstStoreResponse.freshlyWritten).toBe(true)
    expect(firstStoreResponse.normalizedFilename).toBe(expectedFilename)

    const secondStoreResponse = await handleStoreDocV0(tempDir, { project, doc, remoteSeq: Number.NaN })
    expect(secondStoreResponse.freshlyWritten).toBe(false)
    expect(secondStoreResponse.normalizedFilename).toBe(expectedFilename)
  })
})

describe('handleStoreRemoteDocs', () => {
  // C:\\Users\\ericd\\AppData\\Local\\Temp\\docs-3SG87D\\testProject\\remote\\remote.sltt-docs

  it('should handle the empty seqDocs', async () => {
    const docsFolder = tempDir
    const clientId = 'tsc1'
    const project = 'testProject'
    const seqDocs: StoreRemoteDocsArgs<IDBModDoc>['seqDocs'] = []

    const args: StoreRemoteDocsArgs<IDBModDoc> = { clientId, project, seqDocs }
    const response: StoreRemoteDocsResponse = await handleStoreRemoteDocs(docsFolder, args)

    // Check that the response contains no new lines
    expect(response).toEqual({ lastSeq: -1, storedCount: 0 })
  })

  it('should append new lines for incoming seqDocs to new remote.sltt-docs', async () => {
    const docsFolder = tempDir
    const clientId = 'tscl'
    const project = 'testProject'
    const seqDocs: StoreRemoteDocsArgs<IDBModDoc>['seqDocs'] = [
      { doc: { _id: '20240917', modDate: '2024/09/17 12:30:33', creator: 'bob@example.com' }, seq: 1 },
      { doc: { _id: '20240917', modDate: '2024/09/17 12:30:34', creator: 'bob@example.com' }, seq: 2 },
    ]

    const remoteSeqDocsFile = join(docsFolder, project, 'remote', 'remote.sltt-docs')

    const args: StoreRemoteDocsArgs<IDBModDoc> = { clientId, project, seqDocs }
    const response: StoreRemoteDocsResponse = await handleStoreRemoteDocs(docsFolder, args)

    // Check that the remote file was updated with the new lines
    const fileContent = await readFile(remoteSeqDocsFile, 'utf-8')
    const allLines = fileContent.split('\n')
    expect(allLines).toEqual([
      expect.stringMatching(/^000000001\t\d{13}\ttscl\t{"_id":"20240917","modDate":"2024\/09\/17 12:30:33","creator":"bob@example.com"}\t000000001$/),
      expect.stringMatching(/^000000002\t\d{13}\ttscl\t{"_id":"20240917","modDate":"2024\/09\/17 12:30:34","creator":"bob@example.com"}\t000000002$/),
      ''
    ])

    expect(response).toEqual({ lastSeq: 2, storedCount: 2 })
  })

  it('should append new lines for incoming seqDocs with higher seqs to existing remote.sltt-docs', async () => {
    const docsFolder = tempDir
    const clientId = 'tscl'
    const project = 'testProject'
    const seqDocs: StoreRemoteDocsArgs<IDBModDoc>['seqDocs'] = [
      { doc: { _id: '20240917', modDate: '2024/09/17 12:30:33', creator: 'bob@example.com' }, seq: 1 },
      { doc: { _id: '20240917', modDate: '2024/09/17 12:30:34', creator: 'bob@example.com' }, seq: 2 },
      { doc: { _id: '20240917', modDate: '2024/09/17 12:30:35', creator: 'bob@example.com' }, seq: 3 },
    ]

    const expectedExistingLines = [
      '000000001\t1631874633046\ttscl\t{"_id":"20240917","modDate":"2024/09/17 12:30:33","creator":"bob@example.com"}\t000000001',
    ]

    const remoteSeqDocsFile = join(docsFolder, project, 'remote', 'remote.sltt-docs')
    await ensureDir(join(docsFolder, project, 'remote'))
    await writeFile(remoteSeqDocsFile, `${expectedExistingLines[0]}\n`)

    const args: StoreRemoteDocsArgs<IDBModDoc> = { clientId, project, seqDocs }
    const response: StoreRemoteDocsResponse = await handleStoreRemoteDocs(docsFolder, args)

    // Check that the remote file was updated with the new lines
    const fileContent = await readFile(remoteSeqDocsFile, 'utf-8')
    const allLines = fileContent.split('\n')
    expect(allLines).toEqual([
      expectedExistingLines[0],
      expect.stringMatching(/^000000002\t\d{13}\ttscl\t{"_id":"20240917","modDate":"2024\/09\/17 12:30:34","creator":"bob@example.com"}\t000000002$/),
      expect.stringMatching(/^000000003\t\d{13}\ttscl\t{"_id":"20240917","modDate":"2024\/09\/17 12:30:35","creator":"bob@example.com"}\t000000003$/),
      ''
    ])

    expect(response).toEqual({ lastSeq: 3, storedCount: 2 })
  })

  it('should not append new lines for incoming seqDocs with no new seqs to existing remote.sltt-docs', async () => {
    const docsFolder = tempDir
    const clientId = 'tscl'
    const project = 'testProject'
    const seqDocs: StoreRemoteDocsArgs<IDBModDoc>['seqDocs'] = [
      { doc: { _id: '20240917', modDate: '2024/09/17 12:30:33', creator: 'bob@example.com' }, seq: 1 },
    ]

    const expectedExistingLines = [
      '000000001\t1631874633046\ttscl\t{"_id":"20240917","modDate":"2024/09/17 12:30:33","creator":"bob@example.com"}\t000000001',
    ]

    const remoteSeqDocsFile = join(docsFolder, project, 'remote', 'remote.sltt-docs')
    await ensureDir(join(docsFolder, project, 'remote'))
    await writeFile(remoteSeqDocsFile, `${expectedExistingLines[0]}\n`)

    const args: StoreRemoteDocsArgs<IDBModDoc> = { clientId, project, seqDocs }
    const response: StoreRemoteDocsResponse = await handleStoreRemoteDocs(docsFolder, args)

    // Check that the remote file was updated with the new lines
    const fileContent = await readFile(remoteSeqDocsFile, 'utf-8')
    const allLines = fileContent.split('\n')
    expect(allLines).toEqual([
      expectedExistingLines[0],
      ''
    ])

    expect(response).toEqual({ lastSeq: 1, storedCount: 0 })
  })

  it('should handle multiple clients simultaneously updating remote.sltt-docs', async () => {
    const docsFolder = tempDir
    const clientId1 = 'tsc1'
    const clientId2 = 'tsc2'
    const project = 'testProject'
    const seqDocs1: StoreRemoteDocsArgs<IDBModDoc>['seqDocs'] = [
      { doc: { _id: '20240917', modDate: '2024/09/17 12:30:33', creator: 'bob@example.com' }, seq: 1 },
    ]

    const seqDocs2: StoreRemoteDocsArgs<IDBModDoc>['seqDocs'] = [
      { doc: { _id: '20240917', modDate: '2024/09/17 12:30:33', creator: 'bob@example.com' }, seq: 1 },
      { doc: { _id: '20240917', modDate: '2024/09/17 12:30:34', creator: 'bob@example.com' }, seq: 2 },
    ]

    const remoteSeqDocsFile = join(docsFolder, project, 'remote', 'remote.sltt-docs')

    const [responseClient2, responseClient1]: StoreRemoteDocsResponse[] = await Promise.all([
      handleStoreRemoteDocs(docsFolder, {
        clientId: clientId2, project, seqDocs: seqDocs2
      }),
      handleStoreRemoteDocs(docsFolder, {
        clientId: clientId1, project, seqDocs: seqDocs1
      }),
    ])

    // Check that the remote file was updated with the new lines
    const fileContent = await readFile(remoteSeqDocsFile, 'utf-8')
    const allLines = fileContent.split('\n')
    expect(allLines).toEqual([
      expect.stringMatching(/^000000001\t\d{13}\ttsc2\t{"_id":"20240917","modDate":"2024\/09\/17 12:30:33","creator":"bob@example.com"}\t000000001$/),
      expect.stringMatching(/^000000002\t\d{13}\ttsc2\t{"_id":"20240917","modDate":"2024\/09\/17 12:30:34","creator":"bob@example.com"}\t000000002$/),
      expect.stringMatching(/^000000001\t\d{13}\ttsc1\t{"_id":"20240917","modDate":"2024\/09\/17 12:30:33","creator":"bob@example.com"}\t000000001$/),
      ''
    ])

    expect(responseClient2).toEqual({ lastSeq: 2, storedCount: 2 })
    expect(responseClient1).toEqual({ lastSeq: 1, storedCount: 1 })
  })

  describe('handleRetrieveRemoteDocs', () => {
    it('should retrieve remote docs correctly (no spot)', async () => {
      const docsFolder = tempDir
      const clientId = 'tsc1'
      const project = 'testProject'

      // Create the initial remote file with sequence number 1 and 2
      const fullFromPath = join(docsFolder, project, 'remote')
      const remoteSeqDocsFile = join(fullFromPath, 'remote.sltt-docs')
      const fileContent = [
        '000000001\t1234567890123\ttsc1\t{"_id":"doc1","modDate":"2024/09/17 12:30:33","creator":"bob@example.com"}\t000000001',
        '000000002\t1234567890124\ttsc1\t{"_id":"doc2","modDate":"2024/09/17 12:30:34","creator":"alice@example.com"}\t000000002',
      ].join('\n')
      await ensureDir(fullFromPath)
      await writeFile(remoteSeqDocsFile, fileContent)

      const response: RetrieveRemoteDocsResponse<IDBModDoc> = await handleRetrieveRemoteDocs(docsFolder, { clientId, project })

      // Check that the response contains the expected documents
      expect(response.seqDocs).toEqual([
        { seq: 1, doc: { _id: 'doc1', modDate: '2024/09/17 12:30:33', creator: 'bob@example.com' } },
        { seq: 2, doc: { _id: 'doc2', modDate: '2024/09/17 12:30:34', creator: 'alice@example.com' } }
      ])
      expect(response.spot).toEqual({ seq: 2, bytePosition: fileContent.length })
    })
  })

  it('should retrieve remote docs correctly (from spot)', async () => {
    const docsFolder = tempDir
    const clientId1 = 'tsc1'
    const project = 'testProject'

    // Create the initial remote file with sequence number 1 and 2
    const fullFromPath = join(docsFolder, project, 'remote')
    const remoteSeqDocsFile = join(fullFromPath, 'remote.sltt-docs')
    const fileLines = [
      '000000001\t1234567890123\ttsc1\t{"_id":"doc1","modDate":"2024/09/17 12:30:33","creator":"bob@example.com"}\t000000001',
      '000000002\t1234567890124\ttsc1\t{"_id":"doc2","modDate":"2024/09/17 12:30:34","creator":"alice@example.com"}\t000000002',
      '000000001\t1234567890123\ttsc2\t{"_id":"doc1","modDate":"2024/09/17 12:30:33","creator":"bob@example.com"}\t000000001',
      '000000002\t1234567890124\ttsc2\t{"_id":"doc2","modDate":"2024/09/17 12:30:34","creator":"alice@example.com"}\t000000002',
    ]
    await ensureDir(fullFromPath)
    await writeFile(remoteSeqDocsFile, fileLines[0] + '\n')
    const stats = await stat(remoteSeqDocsFile)

    // finish the rest of the file
    await appendFile(remoteSeqDocsFile, fileLines.slice(1).join('\n') + '\n')

    const response: RetrieveRemoteDocsResponse<IDBModDoc> = await handleRetrieveRemoteDocs(
      docsFolder, { clientId: clientId1, project, spot: { seq: 1, bytePosition: stats.size } }
    )

    // Check that the response contains the expected documents
    expect(response.seqDocs).toEqual([
      { seq: 2, doc: { _id: 'doc2', modDate: '2024/09/17 12:30:34', creator: 'alice@example.com' } }
    ])
    const finalStats = await stat(remoteSeqDocsFile)
    expect(response.spot).toEqual({ seq: 2, bytePosition: finalStats.size })
  })

})

describe('handleSaveRemoteSpots', () => {
  it('should save remote spots correctly', async () => {
    const docsFolder = tempDir
    const clientId = 'tsc1'
    const project = 'testProject'
    const spot = { seq: 0, bytePosition: 0 }

    const args: SaveRemoteSpotsArgs = { clientId, project, spots: { 'last': spot } }

    await handleSaveRemoteSpots(docsFolder, args)

    // Verify that the spots file was created and contains the correct data
    const fullFromPath = join(docsFolder, project, 'remote')
    const spotsFile = join(fullFromPath, `${clientId}.sltt-spots`)
    const savedSpots = await readJson(spotsFile, 'utf-8')

    expect(savedSpots).toEqual({ 'last': spot })
  })
})

describe('handleGetRemoteSpots', () => {
  it('should get remote spots correctly', async () => {
    const docsFolder = tempDir
    const clientId = 'tsc1'
    const project = 'testProject'
    const spot = { seq: 0, bytePosition: 0 }

    const fullFromPath = join(docsFolder, project, 'remote')
    const spotsFile = join(fullFromPath, `${clientId}.sltt-spots`)
    await ensureDir(fullFromPath)
    await writeJson(spotsFile, { 'last': spot })

    const response = await handleGetRemoteSpots(docsFolder, { clientId, project })

    expect(response).toEqual({ 'last': spot })
  })

  it('should handle missing spots file correctly', async () => {
    const docsFolder = tempDir
    const clientId = 'tsc1'
    const project = 'testProject'

    const response = await handleGetRemoteSpots(docsFolder, { clientId, project })

    expect(response).toEqual({})
  })
})

describe('handleStoreLocalDocs', () => {
  it('should store local docs correctly', async () => {
    const docsFolder = tempDir
    const clientId = 'tcl1'
    const project = 'testProject'
    const docs: IDBModDoc[] = [
      {
        _id: '20240917',
        modDate: '2024/09/17 12:30:33',
        creator: 'bob@example.com',
        modBy: 'alice@example.com'
      }
    ]

    const { storedCount } = await handleStoreLocalDocs(docsFolder, { clientId, project, docs })
    expect(storedCount).toBe(1)

    // Verify that the file was created and contains the new line
    const clientDocsPath = join(docsFolder, `${clientId}.sltt-docs`)
    const fileContent = await readFile(clientDocsPath, 'utf-8')
    const fileLines = fileContent.split('\n')
    expect(fileLines[0]).toEqual(expect.stringMatching(/^ {2}\t\d{13}\talice@example.com\t{"_id":"20240917","modDate":"2024\/09\/17 12:30:33","creator":"bob@example.com","modBy":"alice@example.com"}$/))
    expect(fileLines[1]).toBe('')
  })

  it('should throw an error if _id or modDate is missing', async () => {
    const docsFolder = tempDir
    const clientId = 'tcl1'
    const project = 'testProject'
    const docs: IDBModDoc[] = [
      {
        _id: '',
        modDate: '',
        creator: 'bob@example.com',
        modBy: 'alice@example.com'
      }
    ]

    const args: StoreLocalDocsArgs<IDBModDoc> = { clientId, project, docs }

    await expect(handleStoreLocalDocs(docsFolder, args)).rejects.toThrow('_id and modDate properties are required in doc')
  })

  it('should throw an error if modBy is missing', async () => {
    const docsFolder = tempDir
    const clientId = 'tsc1'
    const project = 'testProject'
    const docs: IDBModDoc[] = [
      {
        _id: 'doc1',
        modDate: '2024/09/17 12:30:33',
        creator: 'bob@example.com',
        modBy: ''
      }
    ]

    const args: StoreLocalDocsArgs<IDBModDoc> = { clientId, project, docs }

    await expect(handleStoreLocalDocs(docsFolder, args)).rejects.toThrow('modBy property is required in local doc')
  })
})

describe('handleGetStoredLocalClientIds', () => {
  it('should retrieve stored local client IDs correctly', async () => {
    const docsFolder = tempDir
    const project = 'testProject'

    // Create the initial local files with some client IDs
    const fullFromPath = join(docsFolder, project, 'local')
    await ensureDir(fullFromPath)
    const clientDocFiles = ['tcl1.sltt-docs', 'tcl2.sltt-docs', 'tcl3.sltt-docs']
    for (const filename of clientDocFiles) {
      await writeFile(join(fullFromPath, filename), '')
    }
    const otherFiles = ['foo.txt', 'bar.doc']
    for (const filename of otherFiles) {
      await writeFile(join(fullFromPath, filename), '')
    }

    const args: GetStoredLocalClientIdsArgs = { project }
    const response: GetStoredLocalClientIdsResponse = await handleGetStoredLocalClientIds(docsFolder, args)

    // Check that the response contains the expected client IDs
    expect(response).toEqual(['tcl1', 'tcl2', 'tcl3'])
  })

  it('should handle empty directory correctly', async () => {
    const docsFolder = tempDir
    const project = 'testProject'

    // Ensure the directory exists but is empty
    const fullFromPath = join(docsFolder, project)
    await ensureDir(fullFromPath)

    const args: GetStoredLocalClientIdsArgs = { project }
    const response: GetStoredLocalClientIdsResponse = await handleGetStoredLocalClientIds(docsFolder, args)

    // Check that the response contains no client IDs
    expect(response).toEqual([])
  })
})

describe('handleRetrieveLocalClientDocs', () => {
  it.each([
    {
      testCase: 'retrieve local docs correctly - no spot - tsc1, tsc2',
      clientId: 'tsc1',
      localClientIds: ['tsc1', 'tsc2'],
      project: 'testProject',
      spotKey: 'no-spot',
      spots: undefined,
      expectedDocs: [
          { clientId: 'tsc2', doc: { _id: 'doc1', modDate: '2024/09/17 10:30:33', creator: 'bob@example.com', modBy: 'bob@example.com' } },
          { clientId: 'tsc2', doc: { _id: 'doc3', modDate: '2024/09/17 11:30:34', creator: 'alice@example.com', modBy: 'bob@example.com' } },
          { clientId: 'tsc1', doc: { _id: 'doc1', modDate: '2024/09/17 12:30:33', creator: 'bob@example.com', modBy: 'alice@example.com' } },
          { clientId: 'tsc1', doc: { _id: 'doc2', modDate: '2024/09/17 12:30:34', creator: 'alice@example.com', modBy: 'alice@example.com' } },
      ],
      expectedSpots: { 'tsc1': { clientId: 'tsc1', bytePosition: 276 }, 'tsc2': { clientId: 'tsc2', bytePosition: 272 }}
    },
    {
      testCase: 'retrieve local docs correctly - no spot - tsc2',
      clientId: 'tsc1',
      localClientIds: ['tsc2'],
      project: 'testProject',
      spotKey: 'no-spot',
      spots: undefined,
      expectedDocs: [
          { clientId: 'tsc2', doc: { _id: 'doc1', modDate: '2024/09/17 10:30:33', creator: 'bob@example.com', modBy: 'bob@example.com' } },
          { clientId: 'tsc2', doc: { _id: 'doc3', modDate: '2024/09/17 11:30:34', creator: 'alice@example.com', modBy: 'bob@example.com' } },
      ],
      expectedSpots: { 'tsc2': { clientId: 'tsc2', bytePosition: 272 }}
    },
    {
      testCase: 'retrieve local docs correctly - spot - tsc2',
      clientId: 'tsc1',
      localClientIds: ['tsc2'],
      project: 'testProject',
      spots: [{
        spotsClient: 'tsc1',
        spotsContent: { 'tsc2': { clientId: 'tsc2', bytePosition: 136 } },
      }],
      expectedDocs: [
          { clientId: 'tsc2', doc: { _id: 'doc3', modDate: '2024/09/17 11:30:34', creator: 'alice@example.com', modBy: 'bob@example.com' } },
      ],
      expectedSpots: { 'tsc2': { clientId: 'tsc2', bytePosition: 272 }}
    },
  ])('$testCase', async (
    { clientId, localClientIds, project, spots, expectedDocs, expectedSpots }: 
      { clientId: string, localClientIds: string[], project: string, spots: ({ spotsClient: string, spotsContent: { [clientId: string]: LocalSpot } }[] | undefined), expectedDocs: { clientId: string, doc: IDBModDoc }[], expectedSpots: { [clientId: string]: LocalSpot } }
  ) => {
    const docsFolder = tempDir

    // Create the initial local file with some docs
    const fullFromPath = join(docsFolder, project, 'local')
    await ensureDir(fullFromPath)
    const client1DocFile = join(fullFromPath, `tsc1.sltt-docs`)
    const client1DocsContent = [
      `${EMPTY_STATUS}\t1234567890123\talice@example.com\t{"_id":"doc1","modDate":"2024/09/17 12:30:33","creator":"bob@example.com","modBy":"alice@example.com"}`,
      `${EMPTY_STATUS}\t1234567890124\tbob@example.com\t{"_id":"doc2","modDate":"2024/09/17 12:30:34","creator":"alice@example.com","modBy":"alice@example.com"}`,
    ].join('\n')
    await writeFile(client1DocFile, client1DocsContent + '\n')

    const client2DocsFile = join(fullFromPath, `tsc2.sltt-docs`)
    const client2DocsLines = [
      `${EMPTY_STATUS}\t1234567890125\talice@example.com\t{"_id":"doc1","modDate":"2024/09/17 10:30:33","creator":"bob@example.com","modBy":"bob@example.com"}`,
      `${EMPTY_STATUS}\t1234567890126\tbob@example.com\t{"_id":"doc3","modDate":"2024/09/17 11:30:34","creator":"alice@example.com","modBy":"bob@example.com"}`,
    ]
    await appendFile(client2DocsFile, client2DocsLines[0] + '\n')
    if (spots) {
      const stats = await stat(client2DocsFile)
      console.log('stats client2DocsLines[0]', stats.size)
      if (stats.size !== spots[0].spotsContent['tsc2'].bytePosition) {
        throw { stats, spots }
      }
    }
    await appendFile(client2DocsFile, client2DocsLines[1] + '\n')

    for (const localClientId of localClientIds) {
      const args: RetrieveLocalClientDocsArgs = { clientId, localClientId, project, spot: spots ? spots[0].spotsContent[localClientId] : undefined }
      const response: RetrieveLocalClientDocsResponse<IDBModDoc> = await handleRetrieveLocalClientDocs(docsFolder, args)

      // Check that the response contains the expected documents
      expect(response.localDocs).toEqual(expectedDocs.filter(localDoc => localDoc.clientId === localClientId))
      expect(response.spot).toEqual(expectedSpots[localClientId])
    }
  })

  it('should handle empty directory correctly', async () => {
    const docsFolder = tempDir
    const clientId = 'tsc1'
    const localClientId = 'tsc2'
    const project = 'testProject'

    // Ensure the directory exists but is empty
    const fullFromPath = join(docsFolder, project, 'local')
    await ensureDir(fullFromPath)

    const args: RetrieveLocalClientDocsArgs = { clientId, localClientId, project }
    await expect(handleRetrieveLocalClientDocs(docsFolder, args)).rejects.toThrow(`ENOENT: no such file or directory, open '${join(fullFromPath, `${localClientId}.sltt-docs`)}'`)
  })
})

describe('handleSaveLocalSpots', () => {
  it('should save local spots correctly', async () => {
    const docsFolder = tempDir
    const clientId = 'tcl1'
    const project = 'testProject'
    const spots: LocalSpot[] = [{ clientId: 'tcl2', bytePosition: 0 }]

    const args: SaveLocalSpotsArgs = { clientId, project, spots: { 'last': spots } }

    await handleSaveLocalSpots(docsFolder, args)

    // Verify that the spots file was created and contains the correct data
    const fullFromPath = join(docsFolder, project, 'local')
    const spotsFile = join(fullFromPath, `${clientId}.sltt-spots`)
    const savedSpots = await readJson(spotsFile, 'utf-8')

    expect(savedSpots).toEqual(args.spots)
  })
})

describe('handleGetLocalSpots', () => {
  it('should get local spots correctly', async () => {
    const docsFolder = tempDir
    const clientId = 'tcl1'
    const project = 'testProject'
    const spots: LocalSpot[] = [{ clientId: 'tcl2', bytePosition: 0 }]

    const fullFromPath = join(docsFolder, project, 'local')
    const spotsFile = join(fullFromPath, `${clientId}.sltt-spots`)
    await ensureDir(fullFromPath)
    await writeJson(spotsFile, { 'last': spots })

    const response = await handleGetLocalSpots(docsFolder, { clientId, project })

    expect(response).toEqual({ 'last': spots })
    expect(Array.isArray(response.last)).toBe(true)
  })

  it('should handle missing spots file correctly', async () => {
    const docsFolder = tempDir
    const clientId = 'tcl1'
    const project = 'testProject'

    const response = await handleGetLocalSpots(docsFolder, { clientId, project })

    expect(response).toEqual({})
  })
})
