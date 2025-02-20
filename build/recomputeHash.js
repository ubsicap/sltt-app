const YAML = require('yaml')
const crypto = require('crypto')
const fs = require('fs')
const fsPromises = require('fs/promises')
const path = require('path')

/**
 * From https://stackoverflow.com/a/77871470
 * Signing via build/win-sign.js results in latest.yml that has incorrect sha512 hash.
 * As far as I (EricP) can tell there is no hook that can make sure checksums in latest.yml are correct before sending to release. (See https://github.com/electron-userland/electron-builder/issues/2111)
 * The `sign` hook is no longer in the electron-builder api AFAICT.
 * To generate the correct latest.yml use this as a node script and upload latest.yml to the release
 * `TARGET_PATH='dist/sltt-app Setup 206506.4.7.exe' LATEST_YAML_PATH='dist/latest.yml' node build/recomputeHash.js
 * @param {*} file 
 * @returns 
 */
const hashFile = async (file) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512')
    hash.on('error', reject).setEncoding('base64')

    fs.createReadStream(file, {
      highWaterMark: 1024 * 1024,
    })
      .on('error', reject)
      .on('end', () => {
        hash.end()
        resolve(hash.read())
      })
      .pipe(hash, {
        end: false,
      })
    const stats = fs.statSync(file)
    console.log('File size: ', stats.size)
  })
}

/**
 * artifacts on disk are in the format of `${appName} Setup ${version}.exe`
 * e.g. `sltt-app Setup 206506.4.7.exe`
 * but in the release and latest.yml file, it is in the format of `${appName}-Setup-${version}.exe`
 * e.g. `sltt-app-Setup-206506.4.7.exe`
 * @param {*} distFolder
 * @param {*} filePathInYml (e.g. `sltt-app-Setup-206506.4.7.exe`)
 * @param {*} appName (`sltt-app` from package.json > name)
 * @returns 
 */
const getActualFilePath = (distFolder, filePathInYml, appName) => {
  // first split the file by - and replace with spaces and see if it exists
  const resolvedFilePathInYml = path.resolve(path.join(distFolder, filePathInYml))
  const targetFilenameParts = path.basename(resolvedFilePathInYml).split(`${appName}-`)[1].split('-')
  const actualFilePath1 = path.join(path.dirname(resolvedFilePathInYml), [appName, ...targetFilenameParts].join(' '))
  if (fs.existsSync(actualFilePath1)) {
    console.log(`Found file: '${filePathInYml}' --> '${actualFilePath1}'`)
    return actualFilePath1
  }
  // next, test if the file exists as is
  if (fs.existsSync(resolvedFilePathInYml)) {
    return resolvedFilePathInYml
  }
  throw new Error(`File not found: '${actualFilePath1}' or yml path: '${resolvedFilePathInYml}'`)
}

const updateLatestYaml = async (
  latestYamlPath,
  appName,
  waitForYamlPath = false,
  consoleOnly = false
) => {

  if (waitForYamlPath) {
    console.log('Waiting for file: ', latestYamlPath)
    let attempts = 0
    const timeout = 500
    while (!fs.existsSync(latestYamlPath)) {
      if (attempts > 20) {
        throw new Error(`File not found: '${latestYamlPath}' after ${attempts * timeout}ms`)
      }
      await new Promise((resolve) => setTimeout(resolve, timeout))
      attempts++
    }
    console.log(`File found: '${latestYamlPath}' after ${attempts * timeout}ms`)
  }

  const latestYaml = await fsPromises.readFile(latestYamlPath, {
    encoding: 'utf-8',
  })
  const latestDto = YAML.parse(latestYaml)
  const originalDto = YAML.parse(latestYaml)
  const parsedYmlPath = path.parse(latestYamlPath)
  const distFolder = parsedYmlPath.dir
  console.log(`Dist folder: ${distFolder}`)

  const latestDtoPath = getActualFilePath(distFolder, latestDto.path, appName)
  const newHash = await hashFile(latestDtoPath)
  const newSize = fs.statSync(latestDtoPath).size
  console.log(`New path hash (${latestDto.path}):`, newHash)
  console.log('New path size: ', newSize)
  latestDto.sha512 = newHash
  latestDto.size = newSize

  for (const file of latestDto.files) {
    const fullFilePath = getActualFilePath(distFolder, file.url, appName)
    const newFileHash = await hashFile(fullFilePath)
    const stats = await fsPromises.stat(fullFilePath)
    const newFileSize = stats.size
    console.log(`New file hash (${file.url}):`, newFileHash)
    console.log('New file size: ', newFileSize)
    file.sha512 = newFileHash
    file.size = fs.statSync(fullFilePath).size
  }

  console.log(`\n============\nOriginal '${latestYamlPath}':\n============\n${YAML.stringify(originalDto)}`)
  console.log(`============\nUpdated '${latestYamlPath}':\n============\n${YAML.stringify(latestDto)}`)
  if (consoleOnly) {
    console.log('Console only mode, skipping file write')
    return
  }
  await fsPromises.writeFile(latestYamlPath, YAML.stringify(latestDto))
}

const recomputeHash = async (
  latestYamlPath = process.env.LATEST_YAML_PATH,
  waitForYamlPath = process.env.WAIT_FOR_YAML_PATH === 'true',
  consoleOnly = process.env.CONSOLE_ONLY === 'true'
) => {
  try {
    if (!latestYamlPath) {
      console.error('LATEST_YAML_PATH is missing')
      process.exit(1)
    }

    // load package.json and get the app name
    const packageJsonPath = path.join(__dirname, '..', 'package.json')
    const packageJson = await fsPromises
      .readFile(packageJsonPath, {
        encoding: 'utf-8',
      })
      .then(JSON.parse)

    const appName = packageJson.name
    console.log(`App name: '${appName}'`)
    await updateLatestYaml(
      latestYamlPath,
      packageJson.name,
      waitForYamlPath,
      consoleOnly
    )
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
}

module.exports = { recomputeHash }

if (require.main === module) {
  recomputeHash()
}
