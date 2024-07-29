import { vi, describe, it, expect, test } from 'vitest'
import { handleListDocs, handleRetrieveDoc, handleStoreDoc } from './index.ts'

// Basic test to ensure Jest is working
test('basic test', () => {
  expect(1 + 1).toBe(2)
})

// Mock the necessary modules
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  app: {
    getPath: vi.fn().mockReturnValue('mocked/path')
  }
}))

vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn()
}))

vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
  readFile: vi.fn().mockResolvedValue(Buffer.from(JSON.stringify({ key: 'value' }))),
  readdir: vi.fn()
}))

// 1) Test the handleListDocs function
test('list docs', async () => {
  const project = 'testProject'
  const isFromRemote = false
  const docs = await handleListDocs(project, isFromRemote)
  expect(docs).toEqual([])
})

// 2) Test the handleRetrieveDoc function
test('retrieve doc', async () => {
  const project = 'testProject'
  const filename = 'testDoc'
  const isFromRemote = false
  const response = await handleRetrieveDoc(project, isFromRemote, filename)
  expect(response).toEqual({
    doc: { key: 'value' },
    filename: 'testDoc',
    filenameCreator: undefined,
    filenameId: undefined,
    filenameModBy: undefined,
    filenameModDate: undefined,
    fullPath: 'mocked\\path\\persistentStorage\\docs\\testProject\\local\\testDoc',
    remoteSeq: 'testDoc',
  })
})

// 3) Test the handleStoreDoc function
// Mock the crypto module at the top of the file
vi.mock('crypto', () => {
  return {
    createHash: vi.fn().mockImplementation(() => {
      return {
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('b95a492b2e47ec30')
      }
    })
  }
})

describe('handleStoreDoc', () => {
  it('should handle document storage correctly', async () => {
    const project = 'testProject';
    const doc = {
      modDate: '2023-10-01T12:34:56Z',
      _id: 'some-id',
      creator: 'b95a492b',
      modBy: ''  // or could leave this out
    };

    const remoteSeq = 'local-doc';
    const response = await handleStoreDoc(project, doc, remoteSeq);

    // Correct the date formatting
    const modDateFormatted = doc.modDate.replace(/:/g, '-').replace('Z', '').replace('T', 'T');
    const expectedFilename = `local-doc__${modDateFormatted}__${doc._id}__b95a492b__no-mod-by.sltt-doc`;

    console.log('Expected Filename:', expectedFilename); // Debugging line

    // Split the filename correctly
    const parts = expectedFilename.split('__');
    console.log('Filename Parts:', parts); // Debugging line

    const [expectedRemoteSeq, expectedFilenameModDate, expectedFilenameId, expectedFilenameCreator] = parts;
    const expectedFilenameModBy = 'no-mod-by'  

    expect(response).toEqual({
      normalizedFilename: expectedFilename,
      remoteSeq: expectedRemoteSeq,
      filenameModDate: expectedFilenameModDate,
      filenameId: expectedFilenameId,
      filenameCreator: expectedFilenameCreator,
      filenameModBy: expectedFilenameModBy,
      freshlyWritten: true
    });
  });
});

