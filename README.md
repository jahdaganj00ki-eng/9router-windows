# 9Router Windows Installer

Self-contained Windows installer for 9Router, built with Electron + electron-builder.

## Build

All builds run in GitHub Actions. Push a tag `vX.Y.Z` to this repo to trigger a Windows build.

The workflow checks out `jahdaganj00ki-eng/9router` at the same tag, builds the Next.js standalone bundle, and packages it into an Electron app.

## Outputs

- `9Router.Setup.x64.exe` — NSIS installer
- `9Router.exe` — Portable executable

## Development

```bash
npm ci
cd electron
npm run dev
```
