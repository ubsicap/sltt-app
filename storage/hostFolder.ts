import { stat, mkdir, writeFile, unlink, rmdir } from 'fs/promises'
import * as path from 'path'
import { CanWriteToFolderResponse, LoadHostFolderResponse, SaveHostFolderResponse } from './hostFolder.d'
import { platform } from 'os'
import { checkHostStoragePath, serverState, setLANStoragePath, SLTT_APP_LAN_FOLDER } from './serverState'
import { normalize } from 'path'
import disk from 'diskusage'


export const loadHostFolder = async (): Promise<LoadHostFolderResponse> => {
    const defaultFolder = platform() === 'win32' ? 'C:\\sltt-app\\lan' : '/Users/Shared/sltt-app/lan'
    const requiredEnd = normalize(SLTT_APP_LAN_FOLDER)
    const hostFolder = serverState.myLanStoragePath
    const diskUsage = await disk.check(hostFolder || defaultFolder)
    const response = { hostFolder, defaultFolder, requiredEnd, diskUsage }
    console.log(`loadHostFolder: ${JSON.stringify(response)}`)
    return response
}

export const saveHostFolder = async (hostFolder: string): Promise<SaveHostFolderResponse> => {
    console.log(`saveHostFolder: "${hostFolder}"`)
    const normalizedHostFolder = normalize(hostFolder)
    const parts = normalizedHostFolder.split(path.sep)
    const requiredParts = normalize(SLTT_APP_LAN_FOLDER).split(path.sep)
    // find what parts are missing from the end of the folder
    const missingParts = requiredParts.filter((part, index) => parts[parts.length - requiredParts.length + index] !== part)
    // add missing parts to the end of the folder
    const finalFolder = missingParts.reduce((folder, part) => path.join(folder, part), normalizedHostFolder)
    await mkdir(finalFolder, { recursive: true })
    setLANStoragePath(finalFolder)
    return { finalHostFolder: finalFolder }
}

const createTempFile = async (folderPath: string): Promise<void> => {
    try {
        const tempFilePath = path.join(folderPath, 'tempfile.tmp')
        await writeFile(tempFilePath, 'test')
        await unlink(tempFilePath)
    } catch (err) {
        console.error(`Error writing to folder: ${folderPath}`, err)
        throw err
    }
}

/** 
 * canWriteToFolder - test whether the given folder exists if not whether it can be safely written to
 * if we created the folder here, then delete it.
 * if the folder exists, then write a file to it and delete it
 */
const canWriteToFolder = async (folderPath: string): Promise<CanWriteToFolderResponse> => {
    let diskUsage: Awaited<ReturnType<typeof disk.check>>
    try {
        const normalizedFolder = normalize(folderPath.trim())
        console.log(`canWriteToFolder: "${folderPath}" -> "${normalizedFolder}"`)
        
        // Check if the normalizedFolder has an extension
        const ext = path.extname(normalizedFolder)
        if (ext) {
            return { error: `Extension is not allowed in folder path:` + ` "${ext}"`, diskUsage }
        }

        if (!path.isAbsolute(normalizedFolder)) {
            return { error: `Full drive path required.`, diskUsage };
        }

        try {
            checkHostStoragePath(normalizedFolder, false)
            diskUsage = await disk.check(normalizedFolder)
        } catch(err) {
            return { error: err.message, diskUsage }
        }

        // Check if the folder exists
        const stats = await stat(normalizedFolder)
        if (stats.isDirectory()) {
            // Folder exists, check write permissions by creating a temporary file
            await createTempFile(normalizedFolder)
            return { error: '', diskUsage }
        } else {
            console.error(`Path exists but is not a directory: ${folderPath}`)
            return { error: `Path exists but is not a directory.`, diskUsage }
        }
    } catch (err) {
        if (err.code === 'ENOENT') {
            // Folder does not exist, check if we can create it
            try {
                await mkdir(folderPath, { recursive: true })
                // Folder created successfully, check write permissions by creating a temporary file
                await createTempFile(folderPath)
                // Clean up by removing the created folder
                await rmdir(folderPath)
                return { error: '', diskUsage }
            } catch (mkdirErr) {
                console.error(`Write permission error: ${folderPath}`, mkdirErr)
                return { error: `Write permission error.`, diskUsage }
            }
        } else {
            console.error(`Error accessing folder: ${folderPath}`, err)
            return { error: `Error accessing folder.`, diskUsage }
        }
    }
}
export { canWriteToFolder }
