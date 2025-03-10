
export const HOST_FOLDER_API_CAN_WRITE_TO_FOLDER = 'canWriteToFolder'
export const HOST_FOLDER_API_LOAD_HOST_FOLDER = 'loadHostFolder'
export const HOST_FOLDER_API_SAVE_HOST_FOLDER = 'saveHostFolder'
export const HOST_FOLDER_API_SET_ALLOW_HOSTING = 'setAllowHosting'
export const HOST_FOLDER_API_GET_ALLOW_HOSTING = 'getAllowHosting'

/** `Extension is not allowed in folder path:` (errorInfo - ${extension}) */
export const HOST_FOLDER_ERROR_CODE_EXTENSION_IS_NOT_ALLOWED_IN_FOLDER = 'hostFolderError_extensionNotAllowedInFolder'
/** `Full drive path required.` (errorInfo - '') */
export const HOST_FOLDER_ERROR_CODE_FULL_DRIVE_PATH_REQUIRED = 'hostFolderError_fullDrivePathRequired'
/** `Unknown error:` (errorInfo - ${error.message}) */
export const HOST_FOLDER_ERROR_CODE_UNKNOWN_ERROR = 'hostFolderError_unknownError'
/** `Path exists but is not a directory.` (errorInfo - '') */
export const HOST_FOLDER_ERROR_CODE_PATH_EXISTS_BUT_NOT_DIRECTORY = 'hostFolderError_pathExistsButNotDirectory'
/** `Write permission error:` (errorInfo - ${error.message}) */
export const HOST_FOLDER_ERROR_CODE_WRITE_PERMISSION_ERROR = 'hostFolderError_writePermissionError'
/** `Error accessing folder:` (errorInfo - ${error.message}) */
export const HOST_FOLDER_ERROR_CODE_ERROR_ACCESSING_FOLDER = 'hostFolderError_errorAccessingFolder'

export type DiskUsage = { available: number, free: number, total: number }

export type CanWriteToFolderArgs = { folderPath: string }
export type CanWriteToFolderResponse = {
    errorCode: '' |
      HOST_FOLDER_ERROR_CODE_EXTENSION_IS_NOT_ALLOWED_IN_FOLDER |
      HOST_FOLDER_ERROR_CODE_FULL_DRIVE_PATH_REQUIRED | 
      HOST_FOLDER_ERROR_CODE_UNKNOWN_ERROR |
      HOST_FOLDER_ERROR_CODE_PATH_EXISTS_BUT_NOT_DIRECTORY |
      HOST_FOLDER_ERROR_CODE_WRITE_PERMISSION_ERROR | 
      HOST_FOLDER_ERROR_CODE_ERROR_ACCESSING_FOLDER,
    errorInfo: '' | string,
    diskUsage: DiskUsage | undefined
}

export type LoadHostFolderResponse = { hostFolder: string, defaultFolder: string, requiredEnd: string, diskUsage: DiskUsage | undefined }

export type SaveHostFolderArgs = { hostFolder: string }
export type SaveHostFolderResponse = { finalHostFolder: string }

export type SetAllowHostingArgs = { clientId: string, allowHosting: boolean }
export type SetAllowHostingResponse = { ok: true }

export type GetAllowHostingArgs = { clientId: string }
export type GetAllowHostingResponse = { allowHosting: boolean }
