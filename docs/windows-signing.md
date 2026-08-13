# Windows code signing

The `zip` and `msi` artifacts are signed with **Azure Artifact Signing** (formerly Trusted
Signing). The certificate never exists as a file: it lives in Azure, and each signature is a
call to the service. Nothing sensitive is stored in the repo or on a build machine.

This is what stops Smart App Control blocking the direct downloads. The Microsoft Store
route ([windows-msix.md](windows-msix.md)) solves the same problem for Store installs, by a
different mechanism — the Store signs the package itself.

## Configuration

`build.win.azureSignOptions` in `package.json`:

| Field | Value | Where it comes from |
| --- | --- | --- |
| `publisherName` | `Juan Carlos Carmona Calvo` | The **CN** of the certificate subject. Must match exactly |
| `endpoint` | `https://eus.codesigning.azure.net` | Region of the signing account (East US → `eus`) |
| `codeSigningAccountName` | `zingo-pc-signing` | The Azure resource |
| `certificateProfileName` | `Zingo-PC` | Certificate profile inside that resource |

The full certificate subject is
`CN=Juan Carlos Carmona Calvo, O=Juan Carlos Carmona Calvo, L=Boulder, S=co, C=US`, from an
**individual** identity validation. The publisher shown to users is therefore a person, not
an organisation.

`build.win.signExts` adds `.node` and `.dll` to what gets signed. Without it electron-builder
signs only `.exe` files, leaving the native addon, keytar's binding and Electron's own DLLs
unsigned — modules the process loads at runtime, which is exactly what Smart App Control
inspects. `nym-proxy.exe` needs no special handling: `extraResources` are passed through the
signing transformer because it ends in `.exe`.

## Credentials

Three **repository secrets** — real credentials, unlike the Store identity values:

```
AZURE_TENANT_ID
AZURE_CLIENT_ID
AZURE_CLIENT_SECRET
```

They belong to the `Zingo PC` app registration, which holds the
**Artifact Signing Certificate Profile Signer** role on the signing account. Being subscription
Owner is not enough — that role is data-plane and must be assigned explicitly.

⚠️ The client secret **expires**. When it does, Windows builds start failing at the signing
step with an authentication error that does not obviously point at an expired credential.
Note the expiry date somewhere visible.

## Building locally

`dist:win-x64` and `dist:win-arm64` now sign, so they need the same three variables:

```powershell
$env:AZURE_TENANT_ID = "..."
$env:AZURE_CLIENT_ID = "..."
$env:AZURE_CLIENT_SECRET = "..."
yarn dist:win-x64
```

Without them the build fails when it reaches signing. There is no unsigned fallback — that is
deliberate: a silently unsigned artifact is the failure this whole setup exists to prevent.

The `msi` target additionally needs an **elevated** shell (WiX cannot run ICE validation under
a restricted system policy, and `-wx` turns that warning into `LGHT1105`).

Two prerequisites that GitHub's runners carry by default and a developer machine usually does
not. Both surface as confusing errors rather than a missing-dependency message:

- **pwsh (PowerShell 7)** — electron-builder shells out to it for Azure signing, and
  `scripts/sign-nym-proxy.ps1` does too. Windows PowerShell 5.1 is not enough: its
  PowerShellGet cannot load `Install-Module` to pull the `TrustedSigning` module.
  `winget install --id Microsoft.PowerShell -e`
- **The .NET SDK** — `Invoke-TrustedSigning` installs the `sign` dotnet tool on first use, and
  the runtime alone will not do it (*"No .NET SDKs were found"*).
  `winget install --id Microsoft.DotNet.SDK.8 -e`

That script signs `resources/nym-proxy.exe` before packaging, because electron-builder does not
sign `extraResources`: its pass covers the app directory, `resources/app.asar.unpacked` and
`swiftshader`, and the proxy sits in `resources/`. It is spawned as a child process, so Smart
App Control inspects it independently of the main executable.

## Why the MSIX build does not sign

Partner Center re-signs the `.appx` on upload and requires it unsigned. Beyond that, a package
is only valid if the signing certificate subject equals its `Identity/Publisher` — and those
differ here on purpose: the package publisher is the Partner Center seller GUID
(`CN=96EC5B6E-…`), while this certificate is issued to a person. Signing the `.appx` would
produce a package Windows rejects and Partner Center refuses.

It takes **three** switches, none of them obvious:

- **`"!.appx"` in `build.win.signExts`** stops the package itself from being signed.
  `signAndEditExecutable` does not cover this: `AppxTarget` calls `packager.signIf()` on the
  finished artifact, and `signIf` only consults `signExts`.
- **`-c.win.signAndEditExecutable=false`**, passed by `dist:win-msix-*` and the CI step, skips
  the binaries inside the package. Microsoft's signature covers them, so signing here would
  only spend signing calls — and would force this step to carry the Azure credentials.
- **`-c.win.azureSignOptions.publisherName=CN=96EC5B6E-…`**, same two callers, overrides the
  publisher written into the manifest. Once Azure signing is configured, electron-builder puts
  that field straight into `Identity/@Publisher` and ignores `build.appx.publisher`
  (`windowsSignAzureManager.computePublisherName` discards its argument), on the assumption
  that whoever signs a package also publishes it. Ours are deliberately different, and without
  the override the manifest gets a bare personal name, which is not a valid DN — `makeappx`
  rejects it with a pattern-constraint error.

With all three in place the MSIX build needs no credentials at all.

## Reputation

A signature is necessary but not instantly sufficient. Smart App Control wants a valid
signature **and** a favourable reputation prediction, and a freshly issued certificate has no
history. Expect some friction on the first releases while the Intelligent Security Graph
accumulates installs.

Two things help, neither optional if the first releases matter:

- Keep signing with the **same** certificate. Rotating it resets the reputation.
- Submit each release to `microsoft.com/wdsi/filesubmission` as a software developer. That
  feeds the graph directly instead of waiting for organic installs.
