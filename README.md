## Zingo PC

Zingo PC is a shielded Zcash light-client wallet for desktop (Windows, macOS, Linux), built with Electron and powered by the [Zingolib](https://github.com/zingolabs/zingolib) Rust SDK.

---

## Download

Pre-built binaries for each release are available on the [Releases page](https://github.com/zingolabs/zingo-pc/releases).

| Platform | Format |
|----------|--------|
| Windows | `.msi` installer, `.zip` portable |
| macOS | `.dmg` |
| macOS (App Store / TestFlight) | `.pkg` via [TestFlight](https://testflight.apple.com) |
| Linux | `.deb`, `.AppImage` |

---

## Zcash payment links (`zcash:`)

Zingo PC registers itself as the default handler for `zcash:` URIs ([ZIP-321](https://zips.z.cash/zip-0321)), so clicking a payment link in a browser or any app opens the Send screen with address, amount, and memo pre-filled.

### App already open
Clicking a `zcash:` link while the app is running works on all platforms and both Linux package formats.

### App closed (cold start)

| Platform / Format | Works on first click? | Notes |
|-------------------|-----------------------|-------|
| Windows `.msi` | ✅ | Registered at install time |
| Windows `.zip` | ✅ after first run | `setAsDefaultProtocolClient` runs on first launch |
| macOS `.dmg` | ✅ | Registered via Info.plist |
| macOS App Store | ✅ | Registered via Info.plist (MAS entitlements) |
| Linux `.deb` | ✅ | Registered by the package manager at install time |
| Linux `.AppImage` | ✅ after first run | The AppImage must be launched at least once — `setAsDefaultProtocolClient` then registers the handler in `~/.local/share/applications/`. If you later move the AppImage to a different path, run it once from the new location to re-register. |

---

## Compiling from source

Zingo PC is written in Electron/JavaScript and can be built from source. It will also automatically compile the Rust SDK.

### Pre-requisites

* [Node.js >= 18.0.0 (recommended: v22.18.0)](https://nodejs.org/en/blog/release/v22.18.0)
* [Yarn](https://yarnpkg.com)
* [Rust (stable)](https://www.rust-lang.org/tools/install)
* [OpenSSL](https://docs.openssl.org/3.2/man7/ossl-guide-introduction/#getting-and-installing-openssl)
* [Protobuf compiler](https://grpc.io/docs/protoc-installation/)

#### Node.js version manager (recommended)

Using a version manager avoids polluting your system with multiple Node.js installs.

```bash
# Example on Arch Linux
paru -S nvm
nvm install 22.18.0
nvm use 22.18.0
```

### Build and run

```bash
git clone https://github.com/zingolabs/zingo-pc.git
cd zingo-pc
yarn install
yarn build
yarn start
```

### Build distributable binaries

```bash
yarn dist:linux        # Linux (AppImage + deb)
yarn dist:win-x64      # Windows x64
yarn dist:win-arm64    # Windows ARM64
yarn dist:mac-x64      # macOS x64 (DMG)
yarn dist:mac-arm64    # macOS ARM64 (DMG)
yarn dist:mac-mas      # macOS universal (MAS / TestFlight)
```

Binaries are output to the `dist/` directory.
