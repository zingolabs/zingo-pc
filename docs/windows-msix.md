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
yarn dist:win-msix-x64      # or dist:win-msix-arm64
```

Its own script, the same way `dist:mac-mas` sits beside `dist:mac-x64`: the store package is
built separately from the ones that go on the release page. `appx` is deliberately **not** in
`build.win.target`, so `dist:win-x64` keeps producing just `zip` and `msi`.

Output is `dist/Zingo PC <version>.appx` (`-arm64.appx` on the other arch), carrying the real
Partner Center identity from `build.appx` and ready to upload as-is.

Two things this separation buys locally:

- The `msi` target needs an **elevated** shell. WiX cannot run ICE validation under a
  restricted system policy, and electron-builder passes `-wx`, so that warning becomes
  `LGHT1105` and kills the build. The MSIX script never touches WiX.
- No Rust rebuild is wasted on targets you are not shipping to the Store.

Requires the Windows 10/11 SDK (`makeappx.exe`, `signtool.exe`); electron-builder downloads
its own copy on first run. That extraction needs symlink privileges — enable Developer Mode
(Settings → System → For developers), or the build dies unpacking `winCodeSign` with
"Cannot create symbolic link".

## Product identity

`build.appx` holds the values Partner Center assigned when the app name was reserved. They
are not secrets — every published package carries them in its manifest — but they must match
Partner Center **byte for byte** or the upload is rejected:

| Field | Partner Center → app → Product identity |
| --- | --- |
| `identityName` | *Package/Identity/Name* |
| `publisher` | *Package/Identity/Publisher* (the full `CN=...`) |
| `publisherDisplayName` | *Package/Properties/PublisherDisplayName* |

`applicationId` is ours, not Partner Center's, and is unrelated to the Store.

The package version comes from `package.json`; the Store requires the fourth component to be
`0` (electron-builder does this) and the version to increase on every submission.

## Testing locally

The `.appx` that `dist:win-*` produces **cannot be sideloaded** — it is unsigned, and its
publisher is the Store's, not a certificate you hold. The two are mutually exclusive by
design: what you can install locally is not what you can upload.

To install one on this machine, rebuild with a development identity and sign it yourself:

```
npx electron-builder -w appx --x64 -c.extraMetadata.main=build/electron.js --publish never ^
  -c.appx.identityName=ZingoPC -c.appx.publisher="CN=Zingo PC Dev" ^
  -c.appx.publisherDisplayName="Zingo PC Dev"
```

```powershell
# 1. Create the cert (once). Subject must equal the publisher above, exactly.
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

# 3. Sign and install
$signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" |
  Sort-Object FullName | Select-Object -Last 1
& $signtool.FullName sign /fd SHA256 /f zingo-dev.pfx /p devpass "dist\Zingo PC <version>.appx"
Add-AppxPackage "dist\Zingo PC <version>.appx"
```

`zingo-dev.pfx` is a throwaway credential (gitignored) — do not reuse it for anything else.

Both installs show up as "Zingo PC" in the Start menu and are indistinguishable there. Launch
the packaged one explicitly:

```powershell
Start-Process "shell:AppsFolder\$((Get-AppxPackage *ZingoPC*).PackageFamilyName)!ZingoPC"
```

## What to verify in the packaged app

MSIX runs full-trust but virtualizes filesystem and registry writes, so these are the parts
most likely to behave differently from the `msi` build:

- **`zcash:` URI handling.** `app.setAsDefaultProtocolClient` in `public/electron.js` cannot
  register the scheme from inside an MSIX container — its registry writes are virtualized.
  The scheme is instead declared in the package manifest, generated from `build.win.protocols`.
  Test both paths: app closed (cold start) and app already running (`second-instance`).
- **`keytar`.** `getRequireAuth`/`setRequireAuth` swallow any keytar failure and fall back to
  `settings.json`, so a broken keytar looks like a working app. Prove it by toggling the
  device-auth setting and checking that a `Zingo PC` entry appears in Credential Manager.
- **`nym-proxy.exe`.** Spawned as a child process from `extraResources`; confirm it launches
  and that its listening socket works.
- **`electron-settings` / `electron-json-storage`.** Writes to `%APPDATA%` are redirected to
  the package's private store. Existing users migrating from the `msi` build will not see
  their previous settings.

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

`.github/workflows/electron.yml` builds the MSIX inside the existing Windows job rather than
calling `dist:win-msix-*`, which would `rimraf dist` and rebuild Rust from scratch a third
time. It reuses what `dist:win-<arch>` just produced, so it costs seconds.

That is the one place the MAS symmetry stops. MAS earns its own matrix entry because it is a
genuinely different build — universal lipo, different entitlements, different signing. The
Store MSIX is the same build output packed into another container, so a second
electron-builder call in the same job is enough.

It is uploaded as its own artifact (`zingo-pc-win-msix-x64` / `-arm64`) and **excluded from
the GitHub release**, along with the MAS `.pkg`. Both are store-bound: signed by Apple and
Microsoft on upload, so on a release page they would be things nobody can install.

Download both `.appx` files and upload them to the same submission — Partner Center serves
each machine the matching one. An x64-only listing would still run on Windows on ARM through
emulation, just slower and with worse battery life.

## Publishing

The first submission has to be done by hand — reserving the name, the listing, screenshots,
age rating and privacy policy have no unattended path:

1. Register at `partner.microsoft.com` (individual account, one-off fee) and pass identity
   verification.
2. Reserve the app name. That is what mints the product identity values above.
3. Push a `zingo-pc-*` tag and download the two `zingo-pc-win-msix-*` artifacts from the run.
4. Upload both `.appx` files to the submission, unsigned — Partner Center re-signs them.
5. Under Packages, tick **Windows 10/11 Desktop** under device family availability, or the
   product ships available to nobody.
6. Complete the listing (category: Personal finance) and submit for certification.

Later submissions can be automated with the Microsoft Store submission API, which needs an
Entra tenant with an app registration linked under Partner Center → Account settings → User
management. Worth doing only once the manual flow has gone through at least once.
