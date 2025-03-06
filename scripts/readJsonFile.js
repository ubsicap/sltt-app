const { readJson } = require('fs-extra');
const path = require('path');

async function readJsonFile() {
    const adHocPath = `C:\\sltt-app\\lan\\vcrs\\e96f\\TESTnm\\TESTnm__210629_180535.sltt-vcrs-error.1`
    const jsonFilePath = adHocPath || process.env.JSON_PATH;

    if (!jsonFilePath) {
        console.error('Error: JSON_PATH environment variable is not set.');
        process.exit(1);
    }

    try {
        const absolutePath = path.resolve(jsonFilePath);
        const jsonData = await readJson(absolutePath);
        console.log('JSON Data:', jsonData);
    } catch (error) {
        console.error('Error reading JSON file:', error.message);
        process.exit(1);
    }
}

readJsonFile();
