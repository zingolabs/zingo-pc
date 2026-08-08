## Zingo PC

Zingo PC is a shielded Zcash light-client wallet for desktop (Windows, macOS, Linux), built with Electron and powered by the [Zingolib](https://github.com/zingolabs/zingolib) Rust SDK.

App Store: [https://apps.apple.com/app/zingo-pc/id6763584326](https://apps.apple.com/app/zingo-pc/id6763584326)

---

## Download

Pre-built binaries for each release are available on the [Releases page](https://github.com/zingolabs/zingo-pc/releases).

| Platform | Format |
|----------|--------|
| Windows | `.msi` installer, `.zip` portable |
| macOS | `.dmg` |
| macOS (App Store) | [App Store link](https://apps.apple.com/app/zingo-pc/id6763584326) |
| Linux | `.deb`, `.AppImage` |
| Linux (Flatpak) | `.flatpak` |

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
yarn dist:mac-mas      # macOS universal (Mac App Store)
```

Binaries are output to the `dist/` directory.

### Preparing a release

The version and build number live in several files (`package.json`,
`src/version.ts`, `bin/printversion.{sh,ps1}`, plus the AppStream metainfo for
Flatpak). To bump them all in one shot:

```bash
yarn release:prep <X.Y.Z> <BUILD>
# e.g.
yarn release:prep 2.0.15 142
```

---

## Features

**Wallet**
- Light client — no full chain download, syncs from a `lightwalletd` server
- Multi-wallet support — manage several wallets in the same install
- Multi-network — Mainnet, Testnet and Regtest, switchable per wallet
- Create from a fresh BIP-39 seed, restore from seed, or import from a Unified Full Viewing Key (read-only mode)
- Wallet seed phrase / UFVK backup viewer
- Per-wallet performance profiles

**Transactions**
- Full Zcash address support — Unified, Sapling, Transparent and TEX
- Shielded transactions by default (Orchard / Sapling)
- Encrypted memos
- "Shield Transparent → Orchard" one-click action
- `zcash:` URI scheme handler (ZIP-321 payment requests)

**Address book**
- Save contacts per network (Mainnet / Testnet / Regtest) — the list filters by the active wallet's network
- "Show contacts from all networks" toggle to see everything at once
- Stores ZNS aliases verbatim so the address always re-resolves at send time

**Zcash Names (ZNS)** *(experimental)*
- Type `alice.zcash` in the recipient field — auto-resolves to the unified address via the public ZNS indexer
- Network-aware (`Mainnet` / `Testnet`), with a one-click link to the public ZNS explorer page
- Save the alias as a contact (the resolution stays current as the owner updates it on-chain)

**Block explorers**
- User-selectable per-network explorer for transactions and addresses
  (Zcashexplorer, Cipherscan, Zypherscan, or a custom URL)

**Security**
- Hardened Electron renderer (sandboxed, CSP, no node integration)
- Optional device authentication for opening the wallet and signing sends:
  - macOS: Touch ID
  - Windows: Windows Hello
  - Linux (`.deb`): polkit
- Encrypted credential storage (Keychain / Credential Manager / libsecret) for the auth setting itself

**Data portability**
- DMG ↔ MAS first-launch migration assistant (macOS) — imports wallets, address book and settings from a previous DMG install
- Manual "Import data from another installation" from the Settings menu (MAS / Flatpak), with per-file Replace / Merge / Skip choices
- "Change wallets folder location" from the Settings menu (MAS)

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

In order of preference:

- **Flatpak** (recommended): Flatpak runs the app inside its own bubblewrap sandbox, so it does not depend on Chromium's namespace-based sandbox at all. Install the `.flatpak` from the [Releases page](https://github.com/zingolabs/zingo-pc/releases):

  ```bash
  flatpak install Zingo.PC-<version>.flatpak
  ```

- **`.deb` package**: The post-install script sets the `chrome-sandbox` binary as SUID root (the same technique used by the official Google Chrome `.deb`), which restores Chromium's sandbox without relying on user namespaces. If you installed the `.deb` and still see the issue, try reinstalling.

- **AppImage**: The AppImage detects the restriction automatically and disables the Chromium sandbox when needed (a warning is shown). On Ubuntu 24.04 or systems where AppArmor blocks user namespaces and the automatic detection does not catch it, you can launch the AppImage manually with `--no-sandbox`:

  ```bash
  ./Zingo.PC-<version>.AppImage --no-sandbox
  ```

  ⚠️ Note: `--no-sandbox` disables Chromium's process isolation. For a wallet this is a real security concern — prefer the Flatpak or the `.deb` if either is available on your system.

---

**Q: My antivirus warns about a DNS host on port 443 every time I open Zingo PC**

A: This is a false positive from the antivirus, not something Zingo PC connects to on purpose. The host named in the warning is a public **DNS-over-HTTPS (DoH)** resolver — which one depends on the DNS you have configured — and no such host appears anywhere in the Zingo PC or Zingolib source.

The connection comes from Chromium, which Electron embeds. Chromium's secure-DNS mode is `automatic` by default: if your system or router DNS belongs to a provider that also offers DoH, Chromium encrypts its DNS lookups by contacting that provider's DoH endpoint — once per app launch, which is why the warning is tied to opening the wallet. Antivirus products that inspect HTTPS traffic cannot decrypt DoH, so they report the site "may not be displayed correctly". Chrome, Edge and other Electron apps trigger the same warning.

To confirm it on your machine:

- Check which process the antivirus names — it will also fire for your browser.
- Check your DNS servers; if they belong to a public provider, that is the cause:

  ```powershell
  Get-DnsClientServerAddress    # Windows
  ```

The warning is harmless and can be dismissed or allowlisted. Unrelated to it, always download releases from the [official Releases page](https://github.com/zingolabs/zingo-pc/releases) and verify the checksum — that, not an antivirus popup, is how you confirm your build is genuine.
