
exports.default = async function hook(context) {
    const { stringify } = require('safe-stable-stringify')
    console.log(`context: ${stringify(context)}`)
    const path = require('path')
    const { outDir } = context
    console.log(`outDir: ${outDir}`)
    const { recomputeHash } = require('./recomputeHash')
    await recomputeHash(path.join(outDir, 'latest.yml'), true, false)
    return []
}
