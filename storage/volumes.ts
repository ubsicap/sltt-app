import { app } from 'electron'
import { resolve } from 'path'
import checkDiskSpace from 'check-disk-space'

export interface VolumeStats {
    capacity: number  // Total disk space in bytes
    used: number      // Used disk space in bytes
    available: number // Free disk space in bytes
}

/**
 * Get disk space statistics for the volume where the sltt-app is installed.
 * @returns {Promise<VolumeStats>} Disk space statistics including capacity, used, and available space.
 */
export async function getSlttAppVolumeStats(): Promise<VolumeStats> {
    try {
        // Resolve the user data path to determine the volume
        const userDataPath = app.getPath('userData')
        // Use the actual path from app.getPath('userData')
        const volumePath = resolve(userDataPath)

        // Fetch disk space stats for the volume
        const stats = await checkDiskSpace(volumePath)

        // Convert bytes to gigabytes
        const toGigabytes = (bytes: number): string => (bytes / (1024 ** 3)).toFixed(2) + ' GB'

        console.log('Volume Stats in GB:')
        console.log(`- Capacity: ${toGigabytes(stats.size)}`)
        console.log(`- Used: ${toGigabytes(stats.size - stats.free)}`)
        console.log(`- Available: ${toGigabytes(stats.free)}`)

        return {
            capacity: stats.size,       // Total space in bytes
            available: stats.free,      // Free space in bytes
            used: stats.size - stats.free, // Used space in bytes (calculated)
        }
    } catch (error) {
        console.error('Error fetching volume stats:', error)
        throw new Error('Unable to retrieve volume stats.')
    }
}

