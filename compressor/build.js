const { exec } = require('pkg')

// Used this to debug into pkg source code.

async function main() {
    await exec(['win_package.config.json', '--debug', '--targets', 'node12-win-x64',])
}

main().catch(console.error)
