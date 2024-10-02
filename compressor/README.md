# Compressor

This server compresses video files and concatenates them.
It runs on the user's local machine.

The npm module 'pkg' is used to build installable compressor files.

If you fiddle with the build process
check to make sure the resulting win and mac files are still around 125mb. If it becomes &lt; 100mb
you have probably broken the build process.

Even if VSC does not think there is a syntax error ... the pkg module may 
think there is. For example, pkg did not like "x?.y", had to use "x && x.y".

It is necessary to include the --debug flag in the pkg command line if you want to see
specifically why the pkg command is failing.

All package files referenced by the pkg command must either be 'package.json' or end with '.config.json' ...
so don't rename 'win_package.config.json' to end with something other than 'config.json'.
AFAIK this requirement is not mentioned in the documentation ... I learned it by tracing into the code.

## Build and deploy for Windows (.exe)

    yarn pkg-win
    yarn deploy-win-dev     # dev
    yarn deploy-win-prd     # prd

User downloads from:

Sigh, we currently place the production version in sltt-hosting-dev.
To change this we need to update the Help files which we have not done in sometime and
may (or may not) be challenging.

    https://s3.amazonaws.com/sltt-hosting-dev/win/sltt_video_compressor.exe     # prd
    https://s3.amazonaws.com/sltt-hosting-dev/win/sltt_video_compressor_dev.exe     # dev

Download the compressor by pasting the link into the url input field in the browser.
Since the compressor is not signed, the first time you launch the .exe you must
click "more info" and "run anyway" to get the compressor to run.

## Build and deploy Mac compressor

The npm module 'pkg' is used to build installable compressor files for Mac. 
We currently run it via "yarn pkg-mac". 
If you have any kind of syntax error you will only get a very generic message 

    yarn pkg-mac
    yarn deploy-mac-dev    # dev
    yarn deploy-mac-prd    # prd

User installs by running this command:

    curl s3.amazonaws.com/sltt-hosting-prd/mac/compress | bash    # prd, creates sltt_video_compressor
    curl s3.amazonaws.com/sltt-hosting-dev/mac/compress | bash    # dev, creates sltt_video_compressor_dev

### Note

I have not tested whether you can build for Mac on anything other than a Mac.

# Routes
## PUT /

### Request:

Body: multipart/form-data

### Format:

    {
        file: File,
    }

### Response:

    {
        filePath: string,
    }

### Possible Error Codes

- 413 - File is too large
- 400 - `file` field missing

## GET /

### Query params: filePath

### Response: File

### Possible Error Codes

- 400 - `filePath` query parameter is missing
- 404 - file does not exist at `filePath`

## DELETE /

### Query params: filePath

### Response

    {
        result: string
    }

### Possible Error Codes

- 400 - `filePath` query parameter is missing

## PUT /compress

### Body Format

    {
        filePath: string,
        maxFileSizeMB: float,
        ffmpegParameters?: {
            inputOptions?: string[],
            outputOptions?: string[],
            audioFilters?: string[],
            videoFilters?: string[],
            complexFilter?: string[],
            complexFilterOutputMapping?: string[],
        }
    }

### Response

    {
        filePath: string
    }

### Possible Error Codes

- 400 - malformed data

## PUT /concatenate

### Body Format:

    {
        filePaths: string[]
    }

### Response:

    {
        filePath: string,
    }

### Possible Error Codes

- 400 - malformed data

## GET /progress

### Query params: filePath

### Response:

    {
        percent: number,
        finished: boolean,
    }

### Possible Error Codes

- 400 - `filePath` query parameter is missing
- 404 - no progress for `filePath` exists

## GET /metadata

### Query params: filePath

### Response

    {
        filePath: string,
        size: number
    }

### Possible Error Codes

- 400 - `filePath` query parameter is missing
- 404 - file at `filePath` does not exist

## GET /freeSpace

### Response

    {
        free: number
    }

`free` is in bytes

## GET /version

### Response:

    {
        version: string,
    }

## Miscellaneous
The server runs on port 29678.

Some routes respond with ``filePath``. Use it to refer to the file at that location.

When an error occurs, the appropriate error code will be sent in response, with the following body:

    {
        error: string,
    }

The ffmpeg/ffprobe builds come from:

- Windows: https://www.gyan.dev/ffmpeg/builds/
- macOS: https://evermeet.cx/ffmpeg/

We are using the following versions of ffmpeg/ffprobe:

- Windows: 2021-03-31-git-61ea0e3191
- macOS: 101778-g84ac35ecb8