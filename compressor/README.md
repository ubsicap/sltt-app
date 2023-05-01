# Compressor

This server compresses video files and concatenates them.
It runs on the user's local machine.

## Build and deploy for Windows (.exe)

### SLTT

    yarn build-win
    yarn deploy-win-dev

User downloads from:

    https://s3.amazonaws.com/sltt-hosting-dev/win/sltt_video_compressor.exe

### AVTT

    yarn build-win-avtt
    yarn deploy-win-avtt-prd

User downloads from:

    https://s3.amazonaws.com/avtt.bible/win/sltt_video_compressor_zip.zip

### Note

If you are building for Windows on Windows or Linux, you have to change the build-win
and build-win-avtt scripts. Instead of

    sed -i '' 's_/macos\/_/win32\/_g'

do

    sed -i 's_/macos\/_/win32\/_g'

If you are building for Windows on Mac, use the first version. Mac uses a different version of
sed than other operating systems do.

I had to go thru a lot of gyrations to find options to build the win version
and include the correct version of ffmpeg. If you fiddle with the build process
check to make sure the resulting .exe is still around 200mb. If it becomes &lt; 180mb
you have probably broken the build process. The zip should be around 65mb.


## Build and deploy Mac compressor

### SLTT

    yarn pkg-mac
    yarn deploy-mac-prd

User installs by running this command:

    curl s3.amazonaws.com/sltt-hosting-prd/mac/compress | bash

### AVTT

    yarn build-mac-avtt
    yarn deploy-mac-avtt-prd

User installs by running this command:

    curl s3.amazonaws.com/avtt.bible/mac/compress | bash

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

For linux (dev builds) 
[use sudo apt install ffmpeg]
Then the following will be copied to resources
- /usr/bin/ffmpeg
- /usr/bin/ffprobe