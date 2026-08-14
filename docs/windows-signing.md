# Windows packaging and code signing

## The Visual C++ runtime

`native.node` and `nym-proxy.exe` are built with MSVC and import `VCRUNTIME140.dll`.
Electron does not, so without that DLL the window opens perfectly and then every native
call fails: `require()` of the module returns *"the specified module could not be found"*,
`getNative()` yields null, and the app stops on the loading screen.

It is invisible during development. Visual Studio installs the runtime, so developer
machines and CI runners always have it; clean consumer machines often do not. This cost two
Microsoft Store certification rounds — the report was an app that launched and did nothing,
reproducible on their hardware and on nobody's desk.

`scripts/stage-vcruntime.js` copies the DLLs out of the MSVC redistributable into
`resources/vcruntime/` (gitignored, architecture-specific, restaged per build), and
`build.win.extraFiles` places them next to `Zingo PC.exe`. App-local deployment is the model
Microsoft's own documentation recommends for this case, and redistribution is permitted.

`vcruntime140_1.dll` exists only on x64 — it carries C++ exception handling — and is absent
from the arm64 redist, so it is copied when present rather than required.

The `api-ms-win-crt-*` imports need nothing: those are the Universal CRT, shipped with
Windows 10 and later.

# Code signing

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
- **`-c.win.azureSignOptions=`**, same two callers, clears the Azure config for that run. Left
  in place it costs twice: electron-builder constructs the Azure signing manager merely to ask
  it for a publisher name, and that manager validates the credentials on construction — which
  this step deliberately does not carry. It then writes the *certificate's* subject into
  `Identity/@Publisher`, ignoring `build.appx.publisher`
  (`windowsSignAzureManager.computePublisherName` discards its argument) on the assumption that
  whoever signs a package also publishes it. Ours differ on purpose, and the result is a bare
  personal name — not a valid DN — which `makeappx` rejects with a pattern-constraint error.
  Cleared, the publisher comes from `build.appx.publisher` as intended.

With all three in place the MSIX build needs no credentials at all — verified: the run logs
*"AppX is not signed"* and *"file signing skipped via signExts configuration"*, and the
resulting package carries `Publisher='CN=96EC5B6E-…'` with no `AppxSignature.p7x`.

## Reputation

A signature is necessary but not instantly sufficient. Smart App Control wants a valid
signature **and** a favourable reputation prediction, and a freshly issued certificate has no
history. Expect some friction on the first releases while the Intelligent Security Graph
accumulates installs.

Two things help, neither optional if the first releases matter:

- Keep signing with the **same** certificate. Rotating it resets the reputation.
- Submit each release to `microsoft.com/wdsi/filesubmission` as a software developer. That
  feeds the graph directly instead of waiting for organic installs.
