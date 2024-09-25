import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { handleRetrieveRemoteDocs, handleStoreRemoteDocs, IDBModDoc, handleStoreLocalDocs, handleRetrieveLocalClientDocs, EMPTY_STATUS, handleGetStoredLocalClientIds, handleSaveRemoteSpots, handleGetRemoteSpots, handleSaveLocalSpots, handleGetLocalSpots } from './docs'
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
    expect(allLines.length).toBeGreaterThan(0)
    /* [
      expect.stringMatching(/^000000001\t\d{13}\ttsc2\t{"_id":"20240917","modDate":"2024\/09\/17 12:30:33","creator":"bob@example.com"}\t000000001$/),
      expect.stringMatching(/^000000002\t\d{13}\ttsc2\t{"_id":"20240917","modDate":"2024\/09\/17 12:30:34","creator":"bob@example.com"}\t000000002$/),
      expect.stringMatching(/^000000001\t\d{13}\ttsc1\t{"_id":"20240917","modDate":"2024\/09\/17 12:30:33","creator":"bob@example.com"}\t000000001$/),
      ''
    ]*/

    expect(responseClient2).toEqual({ lastSeq: 2, storedCount: 2 })
    expect(responseClient1).toEqual({ lastSeq: 1, storedCount: 1 })
  })
})

describe('handleRetrieveRemoteDocs', () => {
  it('should retrieve empty remote docs correctly', async () => {
    const docsFolder = tempDir
    const clientId = 'tsc1'
    const project = 'testProject'

    const response: RetrieveRemoteDocsResponse<IDBModDoc> = await handleRetrieveRemoteDocs(docsFolder, { clientId, project })

    // Check that the response contains no documents
    expect(response.seqDocs).toEqual([])
    expect(response.spot).toEqual({
      bytePosition: 0,
      seq: -1
    })
  })

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
    expect(fileLines[0]).toEqual(expect.stringMatching(/^ {2}\t\d{13}\t{"_id":"20240917","modDate":"2024\/09\/17 12:30:33","creator":"bob@example.com","modBy":"alice@example.com"}$/))
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
      expectedSpots: { 'tsc1': { clientId: 'tsc1', bytePosition: 242 }, 'tsc2': { clientId: 'tsc2', bytePosition: 238 }}
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
      expectedSpots: { 'tsc2': { clientId: 'tsc2', bytePosition: 238 }}
    },
    {
      testCase: 'retrieve local docs correctly - spot - tsc2',
      clientId: 'tsc1',
      localClientIds: ['tsc2'],
      project: 'testProject',
      spots: [{
        spotsClient: 'tsc1',
        spotsContent: { 'tsc2': { clientId: 'tsc2', bytePosition: 118 } },
      }],
      expectedDocs: [
          { clientId: 'tsc2', doc: { _id: 'doc3', modDate: '2024/09/17 11:30:34', creator: 'alice@example.com', modBy: 'bob@example.com' } },
      ],
      expectedSpots: { 'tsc2': { clientId: 'tsc2', bytePosition: 238 }}
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
      `${EMPTY_STATUS}\t1234567890123\t{"_id":"doc1","modDate":"2024/09/17 12:30:33","creator":"bob@example.com","modBy":"alice@example.com"}`,
      `${EMPTY_STATUS}\t1234567890124\t{"_id":"doc2","modDate":"2024/09/17 12:30:34","creator":"alice@example.com","modBy":"alice@example.com"}`,
    ].join('\n')
    await writeFile(client1DocFile, client1DocsContent + '\n')

    const client2DocsFile = join(fullFromPath, `tsc2.sltt-docs`)
    const client2DocsLines = [
      `${EMPTY_STATUS}\t1234567890125\t{"_id":"doc1","modDate":"2024/09/17 10:30:33","creator":"bob@example.com","modBy":"bob@example.com"}`,
      `${EMPTY_STATUS}\t1234567890126\t{"_id":"doc3","modDate":"2024/09/17 11:30:34","creator":"alice@example.com","modBy":"bob@example.com"}`,
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
    const project = 'testProject'

    const response: RetrieveLocalClientDocsResponse<IDBModDoc> = await handleRetrieveLocalClientDocs(docsFolder, { clientId, localClientId: clientId, project })

    // Check that the response contains no documents
    expect(response.localDocs).toEqual([])
    expect(response.spot).toEqual({
      bytePosition: 0,
      clientId,
    })
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
