import { describe, it, expect, vi } from 'vitest'
import { getSlttAppVolumeStats } from './volumes'

// Mock the Electron app module
vi.mock('electron', () => ({
    app: {
        getPath: vi.fn().mockReturnValue('C:\\Users\\ellis\\AppData\\Roaming\\sltt-app'),
    },
}))

describe('getSlttAppVolumeStats', (): void => {
    it('should return valid volume stats for the mocked path', async (): Promise<void> => {
        const stats = await getSlttAppVolumeStats()

        console.log('Volume Stats:', stats)

        expect(stats).toHaveProperty('capacity')
        expect(stats).toHaveProperty('used')
        expect(stats).toHaveProperty('available')

        expect(typeof stats.capacity).toBe('number')
        expect(typeof stats.used).toBe('number')
        expect(typeof stats.available).toBe('number')

        expect(stats.capacity).toBeGreaterThanOrEqual(0)
        expect(stats.used).toBeGreaterThanOrEqual(0)
        expect(stats.available).toBeGreaterThanOrEqual(0)
    })
})
