import { join } from 'path'

export const getLANStoragePath = (baseDir: string): string => {
    return join(baseDir, 'sltt-app', 'lan')
}
