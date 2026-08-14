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

> **Windows users:** if Windows blocks the app on launch, see [Windows blocks Zingo PC from opening](#troubleshooting) in Troubleshooting. Our Windows builds are code signed, but a recently issued certificate has to accumulate reputation before Windows stops flagging it.

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
- Multi-network — Mainnet, Testnet and Regtest; the network is chosen when the wallet is created and
  fixed from then on, so several wallets can sit on different networks side by side
- Create from a fresh BIP-39 seed, restore from seed, or import from a Unified Full Viewing Key (read-only mode)
- Wallet seed phrase / UFVK backup viewer
- Per-wallet performance profiles
- Rescan from the Wallet menu, with a nonlinear scanning map on the dashboard showing sync progress

**Transactions**
- Full Zcash address support — Unified, Sapling, Transparent and TEX
- Shielded transactions by default (Orchard / Sapling)
- Encrypted memos
- "Shield Transparent → Orchard" one-click action
- `zcash:` URI scheme handler (ZIP-321 payment requests)
- Transaction history, and a separate Messages view for transfers carrying memos
- Financial Insight — amounts sent, number of sends and memo bytes, charted per destination address

**Servers**
- Three selection modes per wallet, shown at all times above the balances:
  - **Auto** — picks a server on every launch and stays automatic
  - **List** — you choose from the published servers
  - **Custom** — your own `lightwalletd` URI
- Live server list from the community registry ([hosh.zec.rocks](https://hosh.zec.rocks)), filtered to online
  clearnet servers and ranked by 30-day uptime; the built-in list is the fallback whenever the registry
  is unreachable
- Health indicator next to the active server — green while it answers, amber after an occasional
  failure, red after three in a row. Clicking it offers the next step for the current mode: switch
  server (Auto), pick from the list (List), or open the wallet settings (Custom)
- A server that stops being published, or that we retire, moves the wallet back to Auto rather than
  leaving it on a dead URI
- "Try Again" on the wallet-open error screen, to retry without changing any settings

**Privacy**
- Nym mixnet transport for wallet traffic, with a status indicator in the sidebar and an on/off
  control under Settings → Nym Mixnet
- ZEC price is fetched over the mixnet only; while the transport is not ready the USD figures read
  `USD --` rather than falling back to clearnet

**Ironwood migration**
- Guided migration of Orchard funds to Ironwood, with progress on the dashboard
- Immediate migration for the straightforward case, and a scheduled, batched migration that spreads
  the transfer over time when privacy calls for it

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
  (Zcashexplorer, Cipherscan, Zexplorer, or a custom URL)

**Security**
- Hardened Electron renderer (sandboxed, CSP, no node integration)
- Optional device authentication for opening the wallet and signing sends:
  - macOS: Touch ID
  - Windows: Windows Hello
  - Linux (`.deb`): polkit
- Encrypted credential storage (Keychain / Credential Manager / libsecret) for the auth setting itself,
  falling back to `settings.json` where no secret service is available (Linux AppImage)

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

**Q: My antivirus warns about `dns.quad9.net` or `cloudflare-dns.com` every time I open Zingo PC**

A: Expected, and it comes from **Mixnet Mode**. Zingo PC bundles the `nym-proxy` binary, which starts with the app. So that its own lookups cannot be intercepted or redirected by whatever DNS your network hands out, the Nym client resolves the hostnames it needs (its API and gateways) through a fixed group of encrypted resolvers instead of the system one: Quad9 and Cloudflare over DNS-over-TLS (port 853) and DNS-over-HTTPS (port 443). This happens once per launch, as the mixnet goes from "Connecting" to "Ready" — which is why the warning is tied to opening the wallet.

Antivirus products that inspect HTTPS traffic cannot decrypt those connections, so they report that the site "may not be displayed correctly". Only hostname lookups travel over them; no wallet data is involved. To confirm, open the **Nym Mixnet** panel in the sidebar and pick "Disable (use clearnet)" — the connections stop for that session. Note the choice is deliberately not saved: the mixnet re-enables on the next launch, and so does the warning.

The fix is to allowlist those two hosts in your antivirus. Do not turn off Mixnet Mode just to silence it — that is what hides your IP from the indexer when you send.

Unrelated to this warning: always download releases from the [official Releases page](https://github.com/zingolabs/zingo-pc/releases) and verify the checksum. That, not an antivirus popup, is how you confirm your build is genuine.

---

**Q: Windows blocks Zingo PC from opening ("Smart App Control" or "Windows protected your PC")**

A: Expected on recent releases. Windows weighs **reputation**, not just whether a file is signed, and a signing certificate starts with no history — so early releases can be flagged exactly like unsigned ones. It clears as installs accumulate. (The publisher on the signature is an individual's name rather than an organisation; that is how the certificate was issued, not a sign the build is unofficial.)

Verify the download yourself rather than trusting Windows' verdict either way. Right-click the file → **Properties** → **Digital Signatures** for a valid, timestamped signature, then check the hash against the [Releases page](https://github.com/zingolabs/zingo-pc/releases):

```powershell
Get-FileHash "Zingo PC <version>.msi" -Algorithm SHA256
```

Then:

- **SmartScreen** (*"Windows protected your PC"*): **More info** → **Run anyway**.
- **Smart App Control** (clean installs of Windows 11 22H2+): no per-app exception exists. It can only be disabled entirely, and **cannot be re-enabled without reinstalling Windows** — we do not recommend it. Use the Microsoft Store build instead once it is published; Store packages are trusted by SAC from the first install.
