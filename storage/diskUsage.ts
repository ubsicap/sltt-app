const diskusage = require('diskusage') as {
    checkSync: (diskPath: string) => { free: number, total: number }
}

export type DiskUsage = { available: number, free: number, total: number }

export const checkDiskUsage = async (diskPath: string): Promise<DiskUsage> => {
    const result = diskusage.checkSync(diskPath)
    return {
        available: result.free,
        free: result.free,
        total: result.total,
    }
}
