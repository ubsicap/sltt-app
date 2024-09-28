import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { handleRegisterClientUser } from './clients' // Adjust the import path as needed
import { RegisterClientUserArgs, RegisterClientUserResponse } from './clients.d' // Adjust the import path as needed
import { ensureDir, writeJson, readJson } from 'fs-extra' // Ensure these functions are imported correctly

let tempDir: string

beforeEach(() => {
  // Create a unique temporary directory
  tempDir = mkdtempSync(join(tmpdir(), 'sltt-app-vitest-'))
})

afterEach(() => {
  // Clean up the temporary directory
  rmdirSync(tempDir, { recursive: true })
})

const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe('handleRegisterClientUser', () => {
    
  it('should register a new client user correctly', async () => {
    const clientsFolder = tempDir
    const clientId = 'f2a4'
    const username = 'test@example.com'

    const args: RegisterClientUserArgs = { clientId, username }

    const response = await handleRegisterClientUser(clientsFolder, args)

    // Verify that the user file was created and contains the correct data
    const clientUserFilePath = join(clientsFolder, `${clientId}.sltt-users`)
    const fileContent = await readJson(clientUserFilePath)
    expect(fileContent).toHaveProperty(username)
    expect(isoRegex.test(fileContent[username])).toBe(true)
    expect(response).toBe(fileContent[username])
  })

  it('should add a user to an existing client user file', async () => {
    const clientsFolder = tempDir
    const clientId = 'f2a4'
    const existingUsername = 'existing@example.com'
    const newUsername = 'new@example.com'

    // Create an initial user file with an existing user
    const clientUserFilePath = join(clientsFolder, `${clientId}.sltt-users`)
    await ensureDir(clientsFolder)
    const initialUsers = { [existingUsername]: Date.now() }
    await writeJson(clientUserFilePath, initialUsers)

    const args: RegisterClientUserArgs = { clientId, username: newUsername }

    const response = await handleRegisterClientUser(clientsFolder, args)

    // Verify that the user file contains both the existing user and the new user
    const fileContent = await readJson(clientUserFilePath)
    expect(fileContent).toHaveProperty(existingUsername)
    expect(fileContent).toHaveProperty(newUsername)
    // Verify that the timestamp is an ISO string
    expect(isoRegex.test(fileContent[newUsername])).toBe(true)
    expect(response).toBe(fileContent[newUsername])
  })

  it('should create the necessary directories if they do not exist', async () => {
    const clientsFolder = join(tempDir, 'nonexistentDir')
    const clientId = 'f2a4'
    const username = 'test@example.com'

    const args: RegisterClientUserArgs = { clientId, username }

    const response = await handleRegisterClientUser(clientsFolder, args)

    // Verify that the necessary directories were created
    const clientUserFilePath = join(clientsFolder, `${clientId}.sltt-users`)
    const fileContent = await readJson(clientUserFilePath)
    expect(fileContent).toHaveProperty(username)
    expect(isoRegex.test(fileContent[username])).toBe(true)
    expect(response).toBe(fileContent[username])
  })

  it('should throw an error if clientId is not a 4-digit hex string', async () => {
    const clientsFolder = tempDir
    const clientId = '123'
    const username = 'test@example.com'

    const args: RegisterClientUserArgs = { clientId, username }

    await expect(handleRegisterClientUser(clientsFolder, args)).rejects.toThrow('clientId must be a (4 character) alphanumeric string, received: 123')
  })

  it('should throw an error if username is not a valid email address', async () => {
    const clientsFolder = tempDir
    const clientId = 'f2a4'
    const username = 'invalid-email'

    const args: RegisterClientUserArgs = { clientId, username }

    await expect(handleRegisterClientUser(clientsFolder, args)).rejects.toThrow('username must be a valid email address, received: invalid-email')
  })
})
