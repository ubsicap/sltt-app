const Rollbar = require('rollbar')
const Bottleneck = require('bottleneck')

let rollbarInstance = undefined

const setupRollbar = ({ accessToken, environment, version, host })  => {
    if (rollbarInstance) {
        console.error('Rollbar already initialized')
        return
    }
    const rollbarConfig = {
        accessToken,
        captureUncaught: true,
        captureUnhandledRejections: true,
        payload: {
            environment,
            host,
            // context: 'rollbar/test'
            client: {
                javascript: {
                    code_version: version,
                    // source_map_enabled: true,
                    // guess_uncaught_frames: true
                }
            }
        },
    }
    rollbarInstance = new Rollbar(rollbarConfig)
}

const MAX_TIME_MS = 1000 // 1 second

// batch multiple errors into a single rollbar error
const errorBatcher = new Bottleneck.Batcher({
    maxTime: MAX_TIME_MS, // 1 second
})

function createChecksum(input) {
    let checksum = 0
    for (let i = 0; i < input.length; i++) {
        checksum += input.charCodeAt(i) * (i + 1) // Simple weighted sum
    }
    // Convert to 4-digit checksum (e.g., mod 10000)
    return (checksum % 10000).toString().padStart(4, '0')
}

// handle batches of errors
errorBatcher.on('batch', async (batch) => {
    if (!rollbarInstance) {
        console.error('Rollbar not initialized')
    }

    const errors = batch.map((report) => {
        const err = report.error
        const custom = report.custom
        return {
            error: err,
            custom,
        }
    })

    const firstReport = errors[0]

    if (errors.length === 1) {
        console.error('Error for Rollbar:\n\t', JSON.stringify(firstReport, null, 2))
        rollbarInstance?.configure({ payload: { fingerprint: undefined, custom: firstReport.custom, errors: [] } })
        rollbarInstance?.error(firstReport.error)
        return
    }

    console.error('Batched errors for Rollbar:\n\t', JSON.stringify(errors, null , 2))
    const batchedPayload = {
        ...firstReport.custom,
        errors: errors.map((report) => ({
            name: report.error.name,
            className: report.error.constructor.name,
            message: report.error.message,
            stack: report.error.stack,
        }))
    }
    const errorChecksum = createChecksum(JSON.stringify(errors.map((report) => report.error.message)))
    const isDuplicateMessages = errors.every((error, _, array) => error.error.message === array[0].error.message)
    const truncatedSummary = `${errors[0].error.message.slice(0, 50)}...${errors.slice(-1)[0].error.message.slice(-50)}`
    const batchMessage = `[${errorChecksum}] Batched ${errors.length} ${isDuplicateMessages ? 'duplicate': ''} errors within ${(MAX_TIME_MS / 1000).toFixed(1)}s: ${truncatedSummary}`
    rollbarInstance?.configure({ payload: { fingerprint: errorChecksum, custom: batchedPayload, errors: batchedPayload.errors } })
    rollbarInstance?.critical(batchMessage, firstReport.error)
})

const reportToRollbar = ({ error, custom }) => {
    if (!rollbarInstance) {
        console.error('Rollbar not initialized')
        return
    }
    errorBatcher.add({ error, custom })
}

module.exports = {
    default: { setupRollbar, reportToRollbar },    
    setupRollbar,
    reportToRollbar,
};