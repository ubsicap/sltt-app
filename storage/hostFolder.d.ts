
export const HOST_FOLDER_API_CAN_WRITE_TO_FOLDER = 'canWriteToFolder'
export const HOST_FOLDER_API_LOAD_HOST_FOLDER = 'loadHostFolder'
export const HOST_FOLDER_API_SAVE_HOST_FOLDER = 'saveHostFolder'
export const HOST_FOLDER_API_SET_ALLOW_HOSTING = 'setAllowHosting'
export const HOST_FOLDER_API_GET_ALLOW_HOSTING = 'getAllowHosting'

type DiskUsage = { available: number, free: number, total: number }

export type CanWriteToFolderArgs = { folderPath: string }
export type CanWriteToFolderResponse = { error: string, diskUsage: DiskUsage | undefined }

export type LoadHostFolderResponse = { hostFolder: string, defaultFolder: string, requiredEnd: string, diskUsage: DiskUsage | undefined }

export type SaveHostFolderArgs = { hostFolder: string }
export type SaveHostFolderResponse = { finalHostFolder: string }

export type SetAllowHostingArgs = { clientId: string, allowHosting: boolean }
export type SetAllowHostingResponse = { ok: true }

export type GetAllowHostingArgs = { clientId: string }
export type GetAllowHostingResponse = { allowHosting: boolean }
