const axios = require('axios')
const YAML = require('yaml')
const FormData = require('form-data')
const fs = require('fs')
const path = require('path')
const fsPromises = require('fs/promises')
const { stringify } = require('safe-stable-stringify')

// Configuration
if (!process.env.GH_TOKEN) {
    console.error('GH_TOKEN is missing')
    process.exit(1)
}
const GITHUB_TOKEN = process.env.GH_TOKEN

let OWNER
let REPO

async function setupOwnerAndRepo() {
    if (OWNER && REPO) {
        return
    }

    // load package.json and get the app name
    const packageJsonPath = path.join(__dirname, '..', 'package.json')
    const packageJson = await fsPromises
        .readFile(packageJsonPath, {
            encoding: 'utf-8',
        })
        .then(JSON.parse)

    OWNER = packageJson.build.publish.owner
    REPO = packageJson.build.publish.repo
}

async function lookupReleaseByAsset(assetName) {
    await setupOwnerAndRepo()
    try {
        const response = await axios.get(
            `https://api.github.com/repos/${OWNER}/${REPO}/releases`,
            {
                headers: {
                    'Accept': 'application/vnd.github+json',
                    'Authorization': `Bearer ${GITHUB_TOKEN}`,
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            }
        )
        const releases = response.data.filter(release => {
            return release.assets.some(asset => asset.name === assetName)
        })
        return releases.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0]

    } catch (error) {
        throw new Error('Error fetching releases:', error.response ? stringify(error.response.data, null, 2) : error.message)
    }
}

async function updateReleaseMetadata(latestYamlPath = process.env.LATEST_YAML_PATH) {
    await setupOwnerAndRepo()
    const latestYaml = await fsPromises.readFile(latestYamlPath, {
        encoding: 'utf-8',
    })
    const latestDto = YAML.parse(latestYaml)
    const release = await lookupReleaseByAsset(latestDto.path)
    if (!release) {
        throw new Error('Release not found')
    }

    // Check if the asset already exists and delete it
    const existingAsset = release.assets.find(asset => asset.name === 'latest.yml')
    if (existingAsset) {
        await deleteAsset(existingAsset.id)
    } else {
        console.warn(`Asset 'latest.yml' not found in release ${release.id}`)
    }
    await postAsset(latestYamlPath, release.id, 'latest.yml')
    console.log('Release metadata updated successfully')
}

async function deleteAsset(assetId) {
    await setupOwnerAndRepo()
    try {
        await axios.delete(
            `https://api.github.com/repos/${OWNER}/${REPO}/releases/assets/${assetId}`,
            {
                headers: {
                    'Accept': 'application/vnd.github+json',
                    'Authorization': `Bearer ${GITHUB_TOKEN}`,
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            }
        )
        console.log(`Asset ${assetId} deleted successfully`)
    } catch (error) {
        throw new Error('Error deleting asset:', error.response ? stringify(error.response.data, null, 2) : error.message)
    }
}

async function postAsset(artifactPath, releaseId, assetName) {
    await setupOwnerAndRepo()
    const fileContent = await fsPromises.readFile(artifactPath, { encoding: 'utf-8' })

    try {
        const response = await axios.post(
            `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?name=${assetName}`,
            fileContent,
            {
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Accept': 'application/vnd.github+json',
                    'Authorization': `Bearer ${GITHUB_TOKEN}`,
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            }
        )
        console.log('File uploaded successfully:', response.data)
    } catch (error) {
        if (error.response && error.response.status === 404) {
            // Ignore 404 error
            // For some reason we get 404 error even though the file is uploaded successfully
            console.warn(`Got NOT FOUND error. Assume it's actually okay...`, stringify(error.response.data, null, 2))
            return
        }
        throw new Error('Error uploading file:', error.response ? stringify(error.response.data, null, 2) : error.message)
    }
}

module.exports = { updateReleaseMetadata }

if (require.main === module) {
    updateReleaseMetadata()
}
