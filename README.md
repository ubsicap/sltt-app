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

### Setup the certificate for code signing (Windows only)

For windows (ask the "Eric Pyle"<epyle@biblesocieties.org> for the p12 file and password, or if needed, it can be gotten from "Tim Steenwyk"<tsteenwyk@biblesocieties.org>).
Tim's signing instructions are at https://docs.google.com/document/d/1Me_5qVJKT4US2o1tVjl-KZNdhkV25Ud19sxtv2k8iGI/edit?pli=1&tab=t.0#heading=h.k3oaogackmbe
Since I (EricP) could not bring myself to install (3.5Gb) WindowsSDK just to have CodeSign, I followed these instructions for `jsign`:
https://knowledge.digicert.com/tutorials/configure-keylocker-for-jsign-using-the-pkcs11-library
*NOTE*: this requires JavaRE to be installed to run the `java` command

See also github workflow https://github.com/ubsicap/sltt/blob/dev/.github/workflows/publish-sltt-app.yml

After everything is setup, the following command is used in `build/win-sign.js` to sign the installer using the `build:win:sign:norelease` or `build:win:sign:release` npm scripts. `build/recomputeHash.js` and `build/updateReleaseMetadata.js` will also be called in `build:win:update:metadata` and `build:win:release:metadata` respectively, in order to make sure the github release gets a `dist/latest.yml` that reflects the checksums of the signed exe installer. Without this, autoUpdater will fail due to mismatched checksums.

**NOTE** the following environment variables must be set:
- `JSIGN_JAR_PATH` - path to the jsign jar file
- `SM_CLIENT_CERT_PASSWORD` - password for the certificate
- `SM_KEYPAIR_ALIAS` - alias for the keypair

```bash
java -jar ${process.env.JSIGN_JAR_PATH} --keystore "C:\\Program Files\\DigiCert\\DigiCert Keylocker Tools\\pkcs11properties.cfg" --storepass ${process.env.SM_CLIENT_CERT_PASSWORD} --storetype PKCS11 --alias ${process.env.SM_KEYPAIR_ALIAS} "${file}"`
```

If you're not able to sign the code, the steps below should still work, but the installer will not be signed, and so should not be used in a published release.

### Build the SLTT client source pages from the https://github.com/ubsicap/sltt repo

**NOTE:** https://github.com/ubsicap/sltt is a separate, private repository

1. Clone the `sltt` repository
```bash
$ git clone https://github.com/ubsicap/sltt.git sltt
```

2. Build the `sltt` client source pages
```bash
$ cd sltt/client
$ git checkout dev; git pull     # OR git checkout main   
$ npm install        # DON'T use yarn install
$ yarn build:dev:sltt-app:client # or build:prd:sltt-app:client
```

3. Set the `SLTT_CLIENT_DIR` environment variable to the `sltt/client` directory

```bash
$ set SLTT_CLIENT_DIR={path to sltt repo sltt/client} # For windows 
```

4. Bump the `package.json` version number

Find the client version number in the build/assets/index-*.js.
It will look like this: const version = "2.63.11";

The package.json version number is used to create the release tag and version number in the file name, and to check client version code to match our build expectations in step 5 below. For example, if the version number is `206311.4.5`, then it will expect to find a version number matching `2.63.11` in the client source code built from step 4. The `4.51 part is the version number is the sltt-app version number. In semantic versioning terms: `4.5` is `major.minor|patch` where the major part represents something breaking between the client and the electron code, and minor|patch are combined to get bumped for something new or something fixed.

Also, the release tag will be `v206311.4.5` and the file name will be `sltt-app Setup 206311.4.5.exe`. For example:

```json
{
  "version": "206311.4.5"
}
```

5. Copy the build `sltt/client/build` to the `sltt-app` `out/client` directory

On Windows, this step will also verify that the client version number matches the expected version number in step 4 above.

```bash
# For Windows
$ yarn copy:build:client # uses the `%SLTT_CLIENT_DIR%` environment variable from step 1.3
# For Mac
$ yarn copy:mac:client # uses the `%SLTT_CLIENT_DIR%` environment variable from step 1.3
```

6. Add a commit message that summarizes the release

Since the release will associate the release with a commit that's already been pushed to the remote, make to include a commit message that you want to be associated with the release. For example:

```bash
$ git commit -am "bump(sltt-app): 206311.4.5 (2.63.11 client / 4.4 sltt-app) add auto update"
$ git push
```

7. Test the new installer

Before publishing the new installer, test the new installer to make sure it works as expected. For example:

```bash
# For Windows
$ npm run build:win:norelease
# For Mac
$ npm run build:mac:norelease
```

The installer will be located in the `dist` directory. For example, `dist/sltt-app Setup 206311.4.5.exe`.

### Publish release to Github (WINDOWS)

1. Set the personal access token (PAT) for the Github account

$ set SLTT_APP_PAT={https://github.com/settings/tokens/new?scopes=public_repo&description=sltt-app}

nlm - I was not able to auto generate the PAT as above.
I had to
- go to the link above in my browser
- authenticate to github
- add a line to my .zshrc: export GH_TOKEN="ghp_pixfz5Z..."

2. Run the `build:win:release script` For example:

```bash
$ yarn build:win:release   # OR yarn build:mac:release
yarn run v1.22.19
warning package.json: No license field
$ npm run build && cross-env GH_TOKEN=%SLTT_APP_PAT% electron-builder --win --config --publish always

> sltt-app@206311.4.5 build
> npm run typecheck && electron-vite build


> sltt-app@206311.4.5 typecheck
> npm run typecheck:node && npm run typecheck:web


> sltt-app@206311.4.5 typecheck:node
> tsc --noEmit -p tsconfig.node.json --composite false


> sltt-app@206311.4.5 typecheck:web
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
  • signing         file=dist\win-unpacked\resources\app.asar.unpacked\node_modules\ffmpeg-static\ffmpeg.exe certificateFile={%CSC_LINK%}
  • building        target=nsis file=dist\sltt-app Setup 206311.4.5.exe archs=x64 oneClick=true perMachine=false
  • signing         file=dist\win-unpacked\resources\elevate.exe certificateFile={%CSC_LINK%}
  •   Signing NSIS uninstaller  file=dist\__uninstaller-nsis-sltt-app.exe certificateFile={%CSC_LINK%}
  • signing         file=dist\sltt-app Setup 206311.4.5.exe certificateFile={%CSC_LINK%}
  • building block map  blockMapFile=dist\sltt-app Setup 206311.4.5.exe.blockmap
  • publishing      publisher=Github (owner: ubsicap, project: sltt-app, version: 206311.4.5)
  • uploading       file=sltt-app-Setup-206311.4.5.exe.blockmap provider=github
  • uploading       file=sltt-app-Setup-206311.4.5.exe provider=github
  • creating GitHub release  reason=release doesn't exist tag=v206311.4.5 version=206311.4.5
    [====================] 100% 0.0s | sltt-app-Setup-206311.4.5.exe to github
Done in 55.90s.
```

### Publish release to Github (Mac)

Assumes that the corresponding Windows release HAS already been published in GitHub:

```bash
$ cd sltt/client
$ git checkout dev; git pull     # OR git checkout main   
$ npm install        # DON'T use yarn install
$ yarn build:dev:sltt-app:client # or build:prd:sltt-app:client

$ cd sltt-app
$ yarn copy:mac:client
$ yarn list:release  # find tag for current release

# verify "version" in package.json is set to current release

$ yarn show:release   # verify version is set to current release
$ yarn build:mac:norelease  # build installer but don't upload

# install dist/sltt-app-${version}.dmg and test

$ yarn upload:mac:release
$ yarn show:release   # verify files uploaded correctly

# should trigger auto update process for users
```


Notes on Building Releases for Mac: [HERE](https://docs.google.com/document/d/1Qk-bz-uRPBThCXs2rRfNnr4QIxsC3yNlM_e7eMjGGHs/edit?usp=sharing)