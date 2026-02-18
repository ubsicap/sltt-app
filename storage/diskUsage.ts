import { checkSync } from 'diskusage'


export type DiskUsage = { available: number, free: number, total: number }

export const checkDiskUsage = async (diskPath: string): Promise<DiskUsage> => {
    const result = checkSync(diskPath)
    return {
        available: result.free,
        free: result.free,
        total: result.total,
    }
}
