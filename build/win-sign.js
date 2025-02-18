
exports.default = async function hook(context) {
    const { file } = context
    if (!String(file).endsWith('.exe')) {
        // skipping non-executable files
        return
    }

    if (process.env.SIGN !== 'true') {
        console.log(`Skipping signing process. env SIGN (${process.env.SIGN}) is not set to 'true'.`)
        return
    }

    const { exec } = require('child_process')
    const { promisify } = require('util')
    const execPromise = promisify(exec)

    console.log(`Signing executable file: ${file}`)
    if (!process.env.JSIGN_JAR_PATH) {
        throw new Error('JSIGN_JAR_PATH environment variable is not set.')
    }
    if (!process.env.SM_CLIENT_CERT_PASSWORD) {
        throw new Error('SM_CLIENT_CERT_PASSWORD environment variable is not set.')
    }
    if (!process.env.SM_KEYPAIR_ALIAS) {
        throw new Error('SM_KEYPAIR_ALIAS environment variable is not set.')
    }
    const signCommand = `java -jar ${process.env.JSIGN_JAR_PATH} --keystore "C:\\Program Files\\DigiCert\\DigiCert Keylocker Tools\\pkcs11properties.cfg" --storepass ${process.env.SM_CLIENT_CERT_PASSWORD} --storetype PKCS11 --alias ${process.env.SM_KEYPAIR_ALIAS} "${file}"`
    await execPromise(signCommand)
    console.log(`Signed executable file: ${file}`)
}
