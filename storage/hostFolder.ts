import { stat, mkdir, writeFile, unlink, rmdir } from 'fs/promises'
import * as path from 'path'

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
const canWriteToFolder = async (folderPath: string): Promise<{ error: string }> => {
    try {
        console.log(`canWriteToFolder: "${folderPath}"`)
        
        // Check if the folderPath has an extension
        const ext = path.extname(folderPath)
        if (ext) {
            return { error: `Extension "${ext}" is not allowed in folder path "${folderPath}"` }
        }

        if (!path.isAbsolute(folderPath)) {
            return { error: `Expected full drive path required. Got "${folderPath}"` };
        }

        // Check if the folder exists
        const stats = await stat(folderPath)
        if (stats.isDirectory()) {
            // Folder exists, check write permissions by creating a temporary file
            await createTempFile(folderPath)
            return { error: '' }
        } else {
            console.error(`Path exists but is not a directory: ${folderPath}`)
            return { error: `Path exists but is not a directory: ${folderPath}` }
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
                return { error: '' }
            } catch (mkdirErr) {
                console.error(`Write permission error: ${folderPath}`, mkdirErr)
                return { error: `Write permission error: ${folderPath}` }
            }
        } else {
            console.error(`Error accessing folder: ${folderPath}`, err)
            return { error: `Error accessing folder: ${folderPath}` }
        }
    }
}
export { canWriteToFolder }
