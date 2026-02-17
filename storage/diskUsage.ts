import checkDiskSpace from 'check-disk-space'

export type DiskUsage = { available: number, free: number, total: number }

export const checkDiskUsage = async (diskPath: string): Promise<DiskUsage> => {
    const result = await checkDiskSpace(diskPath)
    return {
        available: result.free,
        free: result.free,
        total: result.size,
    }
}
