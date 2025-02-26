
export const HOST_FOLDER_API_CAN_WRITE_TO_FOLDER = 'canWriteToFolder'
export const HOST_FOLDER_API_LOAD_HOST_FOLDER = 'loadHostFolder'
export const HOST_FOLDER_API_SAVE_HOST_FOLDER = 'saveHostFolder'

export type CanWriteToFolderArgs = { folderPath: string }
export type CanWriteToFolderResponse = { error: string }

export type LoadHostFolderResponse = { hostFolder: string, defaultFolder: string, requiredEnd: string }

export type SaveHostFolderArgs = { hostFolder: string }
export type SaveHostFolderResponse = { finalHostFolder: string }
