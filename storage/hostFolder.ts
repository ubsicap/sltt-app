import { stat, mkdir, writeFile, unlink, rmdir } from 'fs/promises'
import * as path from 'path'
import { CanWriteToFolderResponse, HOST_FOLDER_ERROR_CODE_ERROR_ACCESSING_FOLDER, HOST_FOLDER_ERROR_CODE_EXTENSION_IS_NOT_ALLOWED_IN_FOLDER, HOST_FOLDER_ERROR_CODE_FULL_DRIVE_PATH_REQUIRED, HOST_FOLDER_ERROR_CODE_PATH_EXISTS_BUT_NOT_DIRECTORY, HOST_FOLDER_ERROR_CODE_UNKNOWN_ERROR, HOST_FOLDER_ERROR_CODE_WRITE_PERMISSION_ERROR, LoadHostFolderResponse, SaveHostFolderResponse } from './hostFolder.d'
import { platform } from 'os'
import { checkHostStoragePath, serverState, setLANStoragePath, SLTT_APP_LAN_FOLDER } from './serverState'
import { normalize } from 'path'
import disk from 'diskusage'
import { isNodeError } from './utils'
import { stringify as safeStableStringify} from 'safe-stable-stringify'


export const loadHostFolder = async (): Promise<LoadHostFolderResponse> => {
    const defaultFolder = platform() === 'win32' ? 'C:\\sltt-app\\lan' : '/Users/Shared/sltt-app/lan'
    const requiredEnd = normalize(SLTT_APP_LAN_FOLDER)
    const hostFolder = normalize(serverState.myLanStoragePath)
    let diskUsage: Awaited<ReturnType<typeof disk.check>> | undefined = undefined
    try {
        diskUsage = await disk.check(hostFolder || defaultFolder)
    } catch (err) {
        console.error(`Error checking disk usage: ${hostFolder || defaultFolder}`)
    }
    const response = { hostFolder, defaultFolder, requiredEnd, diskUsage }
    console.log(`loadHostFolder: ${JSON.stringify(response)}`)
    return response
}

/**
 * this will take a hostFolder and make sure it ends with the required end "sltt-app/lan" (aka SLTT_APP_LAN_FOLDER)
 * So if the hostFolder is "C:\\sltt-app\\lan" or "C:\\sltt-app\\lan\\" it will return "C:\\sltt-app\\lan"
 * if the hostFolder is "C:\\sltt-app" or "C:\\sltt-app\\" it will return "C:\\sltt-app\\lan"
 * if the hostFolder is "C:\\sltt-app\\lan\\subfolder" it will return "C:\\sltt-app\\subfolder\\sltt-app\\lan"
 * if the hostFolder is "c:\\subfolder" it will return "c:\\subfolder\\sltt-app\\lan"
 * @param hostFolder
 */
export const finalizeHostFolder = (hostFolder: string): string => {
    const normalizedHostFolder = normalize(hostFolder.trim()).replace(/[\\/]+$/, '')
    const normalizedEnd = normalize(SLTT_APP_LAN_FOLDER)
    const requiredParts = normalizedEnd.split(path.sep).filter(s => s)
    const appendToEnd: string[] = []
    while (requiredParts.length) {
        const endMaybe = requiredParts.join(path.sep)
        const requiredPart = requiredParts.pop()
        if (normalizedHostFolder.endsWith(endMaybe)) {
            break
        } else if (requiredPart !== undefined) {
            appendToEnd.unshift(requiredPart)
        }
    }
    const finalFolder = path.join(normalizedHostFolder, ...appendToEnd)
    return finalFolder
}

export const saveHostFolder = async (hostFolder: string): Promise<SaveHostFolderResponse> => {
    const finalFolder = finalizeHostFolder(hostFolder)
    console.log(`saveHostFolder: "${hostFolder}" -> "${finalFolder}"`)
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
    let normalizedFolder: string = normalize(folderPath.trim())
    console.log(`canWriteToFolder: "${folderPath}" -> "${normalizedFolder}"`)
    let diskUsage: Awaited<ReturnType<typeof disk.check>> | undefined = undefined
    try {
        // Check if the normalizedFolder has an extension
        const ext = path.extname(normalizedFolder)
        if (ext) {
            return { errorCode: HOST_FOLDER_ERROR_CODE_EXTENSION_IS_NOT_ALLOWED_IN_FOLDER, errorInfo: ext, diskUsage }
        }

        if (!path.isAbsolute(normalizedFolder)) {
            return { errorCode: HOST_FOLDER_ERROR_CODE_FULL_DRIVE_PATH_REQUIRED, errorInfo: '', diskUsage };
        }

        try {
            checkHostStoragePath(normalizedFolder, false)
        } catch(err: unknown) {
            return {
                errorCode: HOST_FOLDER_ERROR_CODE_UNKNOWN_ERROR,
                errorInfo: (err as Error).message || safeStableStringify(err) || '',
                diskUsage 
            }
        }

        // Check if the folder exists
        const stats = await stat(normalizedFolder)
        if (stats.isDirectory()) {
            // Folder exists, check write permissions by creating a temporary file
            await createTempFile(normalizedFolder)
            diskUsage = await disk.check(normalizedFolder)
            return { errorCode: '', errorInfo: '', diskUsage }
        } else {
            console.error(`Path exists but is not a directory: ${normalizedFolder}`)
            return { errorCode: HOST_FOLDER_ERROR_CODE_PATH_EXISTS_BUT_NOT_DIRECTORY, errorInfo: '', diskUsage }
        }
    } catch (err: unknown) {
        if (isNodeError(err) && err.code === 'ENOENT') {
            // Folder does not exist, check if we can create it
            try {
                await mkdir(normalizedFolder, { recursive: true })
                // Folder created successfully, check write permissions by creating a temporary file
                await createTempFile(normalizedFolder)
                diskUsage = await disk.check(normalizedFolder)
                // Clean up by removing the created folder
                await rmdir(normalizedFolder)
                return { errorCode: '', errorInfo: '', diskUsage }
            } catch (mkdirErr: unknown) {
                console.error(`Write permission error: ${normalizedFolder}`, mkdirErr)
                return {
                    errorCode: HOST_FOLDER_ERROR_CODE_WRITE_PERMISSION_ERROR,
                    errorInfo: (mkdirErr as Error).message || safeStableStringify(mkdirErr) || '',
                    diskUsage
                }
            }
        } else {
            console.error(`Error accessing folder: ${normalizedFolder}`, err)
            return {
                errorCode: HOST_FOLDER_ERROR_CODE_ERROR_ACCESSING_FOLDER,
                errorInfo: (err as Error).message || safeStableStringify(err) || '',
                diskUsage
            }
        }
    }
}
export { canWriteToFolder }
