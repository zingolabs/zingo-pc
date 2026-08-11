# Windows MSIX / AppX packaging

Zingo PC's Windows artifacts (`zip`, `msi`) are unsigned, so Windows Smart App Control
blocks them. Publishing an **MSIX package through the Microsoft Store** sidesteps that:
the Store signs the package with Microsoft's own certificate, and Store-installed apps
are trusted by Smart App Control. No code signing certificate has to be bought or
validated.

This is a separate channel, not a replacement — users who download the `zip`/`msi` from
GitHub releases are still affected until those artifacts get signed.

## Build

```
yarn dist:win-msix
```

Produces `dist/Zingo PC <version>.appx`. Requires the Windows 10/11 SDK (`makeappx.exe`,
`signtool.exe`); electron-builder downloads its own copy on first run.

The `appx` target is deliberately *not* in `build.win.target` — `dist:win-x64` keeps
producing only `zip` and `msi`, and the MSIX is built on demand.

## Testing locally before touching Partner Center

The Store signs the package on upload, but an unsigned `.appx` cannot be sideloaded, so
local testing needs a self-signed certificate whose subject matches `build.appx.publisher`
exactly (currently `CN=Zingo PC Dev`).

```powershell
# 1. Create the cert (once)
$cert = New-SelfSignedCertificate -Type Custom -Subject "CN=Zingo PC Dev" `
  -KeyUsage DigitalSignature -FriendlyName "Zingo PC Dev" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")

# 2. Export it and trust it ($pwd is a PowerShell automatic variable — do not reuse the name)
$certPwd = ConvertTo-SecureString -String "devpass" -Force -AsPlainText
Export-PfxCertificate -Cert "Cert:\CurrentUser\My\$($cert.Thumbprint)" `
  -FilePath zingo-dev.pfx -Password $certPwd
Import-PfxCertificate -FilePath zingo-dev.pfx -Password $certPwd `
  -CertStoreLocation "Cert:\LocalMachine\TrustedPeople"

# 3. Sign the built package
$signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" |
  Sort-Object FullName | Select-Object -Last 1
& $signtool.FullName sign /fd SHA256 /f zingo-dev.pfx /p devpass "dist\Zingo PC <version>.appx"

# 4. Install
Add-AppxPackage "dist\Zingo PC <version>.appx"
```

`zingo-dev.pfx` is a throwaway development credential — do not commit it and do not reuse
it for anything else.

## What to verify in the packaged app

MSIX runs full-trust but virtualizes filesystem and registry writes, so these are the
parts most likely to behave differently from the `msi` build:

- **`zcash:` URI handling.** `app.setAsDefaultProtocolClient` in `public/electron.js` cannot
  register the scheme from inside an MSIX container — its registry writes are virtualized.
  The scheme is instead declared in the package manifest, generated from `build.win.protocols`.
  Test both paths: app closed (cold start) and app already running (`second-instance`).
- **`keytar`.** Credential Manager access from a packaged app.
- **`nym-proxy.exe`.** Spawned as a child process from `extraResources`; confirm it launches
  and that its listening socket works.
- **`electron-settings` / `electron-json-storage`.** Writes to `%APPDATA%` are redirected to
  the package's private store. Existing users migrating from the `msi` build will not see
  their previous settings.

## Switching from dev values to Store values

`build.appx` currently holds development placeholders. Three fields must be replaced with
the values Partner Center assigns once the app is reserved:

| Field | Where it comes from |
| --- | --- |
| `identityName` | Partner Center → app → Product identity → *Package/Identity/Name* |
| `publisher` | Partner Center → app → Product identity → *Package/Identity/Publisher* (the `CN=...` string) |
| `publisherDisplayName` | Partner Center → app → Product identity → *Package/Properties/PublisherDisplayName* |

They must match byte for byte or the upload is rejected.

Either edit `package.json` or override at build time without touching the file:

```
electron-builder -w appx --x64 -c.extraMetadata.main=build/electron.js --publish never \
  -c.appx.identityName=... -c.appx.publisher="CN=..." -c.appx.publisherDisplayName=...
```

Upload the resulting `.appx` unsigned — Partner Center re-signs it.

## Store assets

The tile assets live in `public/appx/` (`build.directories.buildResources` is `public`) and
are generated from `resources/icon.png`:

```
powershell -ExecutionPolicy Bypass -File scripts/generate-appx-assets.ps1
```

Re-run it whenever the icon changes. Without these files electron-builder silently falls
back to its own placeholder images — a local build still succeeds, but Store certification
fails.

## CI

`.github/workflows/electron.yml` builds the MSIX in the Windows x64 job, reusing the output
of `dist:win-x64` rather than running a second Rust + webpack cycle. It is uploaded as its
own artifact (`zingo-pc-store-msix`) and **deliberately excluded from the GitHub release**:
as produced by CI the package is unsigned, so a user who downloaded it could not install it.
Only Partner Center can use it, because the Store signs it on upload.

It needs three **repository secrets** (Settings → Secrets and variables → Actions → Secrets),
kept alongside the Apple signing values for consistency:

| Secret | Partner Center → app → Product identity |
| --- | --- |
| `STORE_IDENTITY_NAME` | *Package/Identity/Name* |
| `STORE_PUBLISHER` | *Package/Identity/Publisher* (the full `CN=...`) |
| `STORE_PUBLISHER_DISPLAY_NAME` | *Package/Properties/PublisherDisplayName* |

If any is missing the step fails with a message naming it, rather than skipping quietly.

Note they are masked as `***` in the run log. If Partner Center ever rejects a package for a
publisher mismatch, compare against Partner Center directly — the log will not show you the
value that was used.

Only x64 is built for the Store. Adding arm64 means a second package and a second entry in
the same submission; nothing in the config prevents it, it just is not wired up.

## Publishing

The first submission has to be done by hand — reserving the name, the listing, screenshots,
age rating and privacy policy have no unattended path:

1. Register at `partner.microsoft.com` (individual account, one-off fee) and pass identity
   verification.
2. Reserve the app name. That is what mints the product identity values above.
3. Set the three repository variables, then push a `zingo-pc-*` tag.
4. Download the `zingo-pc-store-msix` artifact from the run and upload the `.appx` to the
   submission. Upload it unsigned — Partner Center re-signs it.
5. Complete the listing and submit for certification.

Later submissions can be automated with the Microsoft Store submission API, which needs an
Entra tenant with an app registration linked under Partner Center → Account settings → User
management. Worth doing only once the manual flow has gone through at least once.
