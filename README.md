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

---

## Troubleshooting

**Q: Clicking a `zcash:` payment link doesn't open Zingo PC (Linux AppImage)**

A: The AppImage must be launched at least once from its current location before the OS registers it as the handler for `zcash:` links. After the first launch, cold-start links work automatically. If you move the AppImage to a new path, launch it once from the new location to re-register it.

---

**Q: "Require device authentication" is greyed out on Linux**

A: Device authentication on Linux relies on [polkit](https://www.freedesktop.org/software/polkit/docs/latest/) and a policy file that must be installed at the system level. This is only supported by the `.deb` package, which installs the policy automatically via its post-install script.

If you are running the **AppImage**, device authentication is not available and the option will remain disabled. Use the `.deb` package instead if you need this feature.

If you installed the `.deb` package and the option is still greyed out, verify the policy file is in place:

```bash
ls /usr/share/polkit-1/actions/co.zingo.pc.policy
```

If the file is missing, reinstall the package or copy it manually:

```bash
sudo cp /opt/Zingo\ PC/resources/co.zingo.pc.policy /usr/share/polkit-1/actions/
sudo chmod 644 /usr/share/polkit-1/actions/co.zingo.pc.policy
```

---

**Q: The app security setting is not being saved securely on Linux (falls back to a plain file)**

A: Zingo PC stores the "Require device authentication" setting in the OS credential store via the [Secret Service API](https://specifications.freedesktop.org/secret-service/latest/) (libsecret). This requires a secrets daemon to be running — typically **GNOME Keyring** or **KDE Wallet**.

If neither is available (e.g. a minimal desktop environment or a headless system), the setting falls back to a plain configuration file, which offers no tamper protection.

To fix this, install and start a compatible secrets daemon:

```bash
# Debian / Ubuntu / Arch (GNOME Keyring)
sudo apt install gnome-keyring        # Debian/Ubuntu
paru -S gnome-keyring                 # Arch

# or KDE Wallet (if using a KDE-based desktop)
sudo apt install kwalletmanager
```

After installing, log out and back in so the daemon starts with your session.

---

**Q: The app shows a blank blue screen and never loads (Linux — Ubuntu 22.04+, Debian 11+, Linux Mint)**

A: Ubuntu 22.04 and later restrict unprivileged user namespaces at the kernel level, which breaks Chromium's built-in process sandbox that Electron depends on.

- **`.deb` package**: This is fixed automatically by the post-install script, which sets the `chrome-sandbox` binary as SUID root (the same technique used by the official Google Chrome `.deb`). If you installed the `.deb` and still see the issue, try reinstalling.

- **AppImage**: The AppImage detects the restriction automatically and disables the Chromium sandbox when needed. If you are on Ubuntu 24.04 or a system where AppArmor blocks user namespaces and the automatic detection does not work, you can launch the AppImage manually with:

  ```bash
  ./ZingoPC.AppImage --no-sandbox
  ```
