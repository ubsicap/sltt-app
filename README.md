# sltt-app

An installable SLTT app (Sign Language Translation Tool) for Windows (todo: macOS)

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Setup the certificate for code signing

```bash
# For windows (ask the "Eric Pyle"<epyle@biblesocieties.org> for the pfx file and password, or if needed, it can be gotten from "Jeff Klassen"<jklassen@biblesocieties.org>)
$ set CSC_LINK={pfx path https://www.electron.build/code-signing.html}
$ set CSC_KEY_PASSWORD={pfx password}
$ set SLTT_APP_PAT={https://github.com/settings/tokens/new?scopes=public_repo&description=sltt-app}
```

### Build the SLTT client source pages from the https://github.com/ubsicap/sltt repo

**NOTE:** https://github.com/ubsicap/sltt is a separate, private repository

1. Clone the `sltt` repository
```bash
$ git clone https://github.com/ubsicap/sltt.git sltt
```

2. Build the `sltt` client source pages
```bash
$ cd sltt/client
$ yarn install
$ yarn build:sltt-app:client
```

3. Set the `SLTT_CLIENT_PATH` environment variable to the `sltt/client` directory

```bash
$ set SLTT_CLIENT_PATH={path to sltt repo sltt/client} # For windows 
```

4. Copy the build `sltt/client/build` to the `sltt-app` `out/client` directory

```bash
$ yarn rmdir:build:client # remove the existing build
$ yarn copy:build:client # uses the `%SLTT_CLIENT_PATH%` environment variable from step 1.3
```

5. Bump the package.json version number

The package.json version number is used to create the release tag and version number in the file name. For example, if the version number is `1.0.6`, the release tag will be `v1.0.6` and the file name will be `sltt-app Setup 1.0.6.exe`. For example:

```json
{
  "version": "1.0.6"
}
```

6. Add a commit message that summarizes the release

Since the release will associate the release with a commit that's already been pushed to the remote, make to include a commit message that you want to be associated with the release. For example:

```bash
$ git commit -am "bump(1.0.6) add auto update"
$ git push
```

7. Test the new installer

Before publishing the new installer, test the new installer to make sure it works as expected. For example:

```bash
# For windows
$ npm run build:win:norelease
```

The installer will be located in the `dist` directory. For example, `dist/sltt-app Setup 1.0.6.exe`.

### Publish release to Github

1. Run the `build:win:release script` For example:

$ yarn build:win:release   
yarn run v1.22.19
warning package.json: No license field
$ npm run build && cross-env GH_TOKEN=%SLTT_APP_PAT% electron-builder --win --config --publish always

> sltt-app@1.0.8 build
> npm run typecheck && electron-vite build


> sltt-app@1.0.8 typecheck
> npm run typecheck:node && npm run typecheck:web


> sltt-app@1.0.8 typecheck:node
> tsc --noEmit -p tsconfig.node.json --composite false


> sltt-app@1.0.8 typecheck:web
> tsc --noEmit -p tsconfig.web.json --composite false

vite v4.3.3 building for production...
✓ 2 modules transformed.
out/main/index.js  1.59 kB
✓ built in 72ms
vite v4.3.3 building for production...
✓ 1 modules transformed.
out/preload/index.js  0.42 kB
✓ built in 8ms
vite v4.3.3 building for production...
✓ 33 modules transformed.
../../out/renderer/index.html                   0.53 kB
../../out/renderer/assets/icons-6e56aee6.svg    9.10 kB
../../out/renderer/assets/index-3d722ea0.css    3.00 kB
../../out/renderer/assets/index-45827464.js   227.91 kB
✓ built in 458ms
  • electron-builder  version=23.6.0 os=10.0.22631
  • loaded configuration  file=package.json ("build" field)
  • writing effective config  file=dist\builder-effective-config.yaml
  • packaging       platform=win32 arch=x64 electron=22.3.7 appOutDir=dist\win-unpacked
  • cannot decode PKCS 12 data using Go pure implementation, openssl will be used  error=pkcs12: unknown digest algorithm: 2.16.840.1.101.3.4.2.1
  • signing         file=dist\win-unpacked\resources\app.asar.unpacked\node_modules\ffprobe-static\bin\win32\x64\ffprobe.exe certificateFile={%CSC_LINK%}
  • signing         file=dist\win-unpacked\resources\app.asar.unpacked\node_modules\ffprobe-static\bin\win32\ia32\ffprobe.exe certificateFile={%CSC_LINK%}
  • signing         file=dist\win-unpacked\resources\app.asar.unpacked\node_modules\ffmpeg-static\ffmpeg.exe certificateFile={%CSC_LINK%}
  • building        target=nsis file=dist\sltt-app Setup 1.0.8.exe archs=x64 oneClick=true perMachine=false
  • signing         file=dist\win-unpacked\resources\elevate.exe certificateFile={%CSC_LINK%}
  •   Signing NSIS uninstaller  file=dist\__uninstaller-nsis-sltt-app.exe certificateFile={%CSC_LINK%}
  • signing         file=dist\sltt-app Setup 1.0.8.exe certificateFile={%CSC_LINK%}
  • building block map  blockMapFile=dist\sltt-app Setup 1.0.8.exe.blockmap
  • publishing      publisher=Github (owner: ubsicap, project: sltt-app, version: 1.0.8)
  • uploading       file=sltt-app-Setup-1.0.8.exe.blockmap provider=github
  • uploading       file=sltt-app-Setup-1.0.8.exe provider=github
  • creating GitHub release  reason=release doesn't exist tag=v1.0.8 version=1.0.8
    [====================] 100% 0.0s | sltt-app-Setup-1.0.8.exe to github
Done in 55.90s.
```
