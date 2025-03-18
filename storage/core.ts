import { join } from 'path'

export const buildLANStoragePath = (baseDir: string): string => {
    return join(baseDir, 'sltt-app', 'lan')
}
