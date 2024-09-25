import { ensureDir, writeJson } from 'fs-extra'
import { RegisterClientUserArgs, RegisterClientUserResponse } from './clients.d';
import { readJsonCatchMissing } from './utils'

export const handleRegisterClientUser = async (clientsFolder: string, { clientId, username }: RegisterClientUserArgs): Promise<RegisterClientUserResponse> => {
    if (!/^\d{4}$/.test(clientId)) {
        throw new Error(`clientId must be a 4-digit string, received: ${clientId}`)
    }
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(username)) {
        throw new Error(`username must be a valid email address, received: ${username}`)
    }
    const clientUserFilePath = `${clientsFolder}/${clientId}.sltt-users`
    await ensureDir(clientsFolder)
    const clientUsers = await readJsonCatchMissing<{ [username: string]: string }, Record<string, never>>(clientUserFilePath, {})
    clientUsers[username] = new Date().toISOString()
    await writeJson(clientUserFilePath, clientUsers)
    return clientUsers[username]
}
