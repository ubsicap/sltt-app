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

### Build

```bash
# For windows
$ npm run build:win:norelease
```

### Release

1. Edit `package.json` to bump the semantic version number. For example:

```json
{
  "version": "1.0.6"
}
```

2. Add a commit message that summarizes the release

Since the release will associate the release with a commit that's already been pushed to the remote, make to include a commit message that you want to be associated with the release. For example:

```bash
$ git commit -am "bump(1.0.6) add auto update"
$ git push
```
3. Run the `build:win:release script` For example:

```bash
# For windows
$ set SLTT_APP_PAT={https://github.com/settings/tokens/new?scopes=public_repo&description=sltt-app}
$ npm run build:win:release
yarn run v1.22.19
warning package.json: No license field
$ npm run build && cross-env GH_TOKEN=%SLTT_APP_PAT% electron-builder --win --config --publish always

> sltt-app@1.0.6 build
> npm run typecheck && electron-vite build


> sltt-app@1.0.6 typecheck
> npm run typecheck:node && npm run typecheck:web


> sltt-app@1.0.6 typecheck:node
> tsc --noEmit -p tsconfig.node.json --composite false


> sltt-app@1.0.6 typecheck:web
> tsc --noEmit -p tsconfig.web.json --composite false

vite v4.3.3 building for production...
✓ 2 modules transformed.
out/main/index.js  1.59 kB
✓ built in 94ms
vite v4.3.3 building for production...
✓ 1 modules transformed.
out/preload/index.js  0.42 kB
✓ built in 10ms
vite v4.3.3 building for production...
✓ 33 modules transformed.
../../out/renderer/index.html                   0.53 kB
../../out/renderer/assets/icons-6e56aee6.svg    9.10 kB
../../out/renderer/assets/index-3d722ea0.css    3.00 kB
../../out/renderer/assets/index-45827464.js   227.91 kB
✓ built in 449ms
  • electron-builder  version=23.6.0 os=10.0.22631
  • loaded configuration  file=package.json ("build" field)
  • writing effective config  file=dist\builder-effective-config.yaml
  • packaging       platform=win32 arch=x64 electron=22.3.7 appOutDir=dist\win-unpacked
  • cannot decode PKCS 12 data using Go pure implementation, openssl will be used  error=pkcs12: unknown digest algorithm: 2.16.840.1.101.3.4.2.1
  • signing         file=dist\win-unpacked\sltt-app.exe certificateFile={path-to-pfx}
  • building        target=nsis file=dist\sltt-app Setup 1.0.6.exe archs=x64 oneClick=true perMachine=false
  • signing         file=dist\win-unpacked\resources\elevate.exe certificateFile={path-to-pfx}
  •   Signing NSIS uninstaller  file=dist\__uninstaller-nsis-sltt-app.exe certificateFile={path-to-pfx}
  • signing         file=dist\sltt-app Setup 1.0.6.exe certificateFile={path-to-pfx}
  • building block map  blockMapFile=dist\sltt-app Setup 1.0.6.exe.blockmap
  • publishing      publisher=Github (owner: ubsicap, project: sltt-app, version: 1.0.6)
  • uploading       file=SLTT-app-Setup-1.0.6.exe.blockmap provider=github
  • uploading       file=SLTT-app-Setup-1.0.6.exe provider=github
  • creating GitHub release  reason=release doesn't exist tag=v1.0.6 version=1.0.6
    [====================] 100% 0.0s | SLTT-app-Setup-1.0.6.exe to github
Done in 38.75s.
```
