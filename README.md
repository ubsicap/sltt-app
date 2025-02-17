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

After everything is setup, the following command can be used to sign the installer:

```bash
java -jar path\to\jsign-5.0.jar --keystore "C:\Program Files\DigiCert\DigiCert Keylocker Tools\pkcs11properties.cfg" --storepass <certificate password> --storetype PKCS11 --alias <keypair> "sltt-app Setup <version>.exe"
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
$ yarn install
$ yarn build:dev:sltt-app:client // or build:prd:sltt-app:client
```

3. Set the `SLTT_CLIENT_PATH` environment variable to the `sltt/client` directory

```bash
$ set SLTT_CLIENT_PATH={path to sltt repo sltt/client} # For windows 
```

4. Bump the `package.json` version number

The package.json version number is used to create the release tag and version number in the file name, and to check client version code to match our build expectations in step 5 below. For example, if the version number is `206311.4.5`, then it will expect to find a version number matching `2.63.11` in the client source code built from step 4. The `4.51 part is the version number is the sltt-app version number. In semantic versioning terms: `4.5` is `major.minor|patch` where the major part represents something breaking between the client and the electron code, and minor|patch are combined to get bumped for something new or something fixed.

Also, the release tag will be `v206311.4.5` and the file name will be `sltt-app Setup 206311.4.5.exe`. For example:

```json
{
  "version": "206311.4.5"
}
```

5. Copy the build `sltt/client/build` to the `sltt-app` `out/client` directory

This step will also verify that the client version number matches the expected version number in step 4 above.

```bash
$ yarn copy:build:client # uses the `%SLTT_CLIENT_PATH%` environment variable from step 1.3
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
# For windows
$ npm run build:win:norelease
```

The installer will be located in the `dist` directory. For example, `dist/sltt-app Setup 206311.4.5.exe`.

### Publish release to Github

1. Set the personal access token (PAT) for the Github account

$ set SLTT_APP_PAT={https://github.com/settings/tokens/new?scopes=public_repo&description=sltt-app}

2. Run the `build:win:release script` For example:

```bash
$ yarn build:win:release   
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

# Building Releases for Mac

Discussion of process [HERE](https://docs.google.com/document/d/1Qk-bz-uRPBThCXs2rRfNnr4QIxsC3yNlM_e7eMjGGHs/edit?usp=sharing)