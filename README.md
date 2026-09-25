## Zingo PC

Zingo PC is a shielded Zcash light-client wallet for desktop (Windows, macOS, Linux), built with Electron and powered by the [Zingolib](https://github.com/zingolabs/zingolib) Rust SDK.

App Store: [https://apps.apple.com/app/zingo-pc/id6763584326](https://apps.apple.com/app/zingo-pc/id6763584326)

---

## Download

Pre-built binaries for each release are available on the [Releases page](https://github.com/zingolabs/zingo-pc/releases).

| Platform           | Format                                                             |
| ------------------ | ------------------------------------------------------------------ |
| Windows            | `.msi` installer, `.zip` portable                                  |
| macOS              | `.dmg`                                                             |
| macOS (App Store)  | [App Store link](https://apps.apple.com/app/zingo-pc/id6763584326) |
| macOS (TestFlight) | [Public beta](https://testflight.apple.com/join/qBDKNJqk)          |
| Linux              | `.deb`, `.AppImage`                                                |
| Linux (Flatpak)    | `.flatpak`                                                         |

> **Trying the beta:** the TestFlight build is where what is still being tested reaches first — swaps
> among it — before any of it goes to the App Store. It needs a Mac and the TestFlight app; the link
> above joins the public group, no invitation needed. Feedback is welcome from there.

> **Windows users:** if Windows blocks the app on launch, see [Windows blocks Zingo PC from opening](#troubleshooting) in Troubleshooting. Our Windows builds are code signed, but a recently issued certificate has to accumulate reputation before Windows stops flagging it.

---

## Compiling from source

Zingo PC is written in Electron/JavaScript and can be built from source. It will also automatically compile the Rust SDK.

### Pre-requisites

- [Node.js >= 18.0.0 (recommended: v22.18.0)](https://nodejs.org/en/blog/release/v22.18.0)
- [Yarn](https://yarnpkg.com)
- [Rust (stable)](https://www.rust-lang.org/tools/install)
- [CMake](https://cmake.org/download/)
- [Protobuf compiler](https://grpc.io/docs/protoc-installation/)

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

`yarn build` also builds `nym-proxy`, the mixnet transport, whose source lives
in zingolib. Nothing to set up for it: the build fetches zingolib into
`.zingolib-src/` at the exact revision `native/Cargo.lock` pins, the same
revision the Rust SDK is compiled from, so the proxy and the wallet core are
always the same zingolib. CI runs these same steps.

`yarn mixnet` rebuilds only `nym-proxy`, which is all that is needed after the
pinned revision changes.

To build the proxy from a zingolib working copy instead — when developing
`nym-proxy` itself — point `ZINGOLIB_PATH` at it. That opts out of the pinning,
so it warns, and the `dist:*` scripts refuse it outright.

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
- Follows the chain while it is open — sync stays at the tip and scans each block as it is mined,
  rather than running to the end and waiting to be asked again, so a payment shows up when it lands
- Looks ten transparent addresses past the last one used, so funds sent to an address you skipped are
  found rather than left behind the first gap
- Multi-wallet support — manage several wallets in the same install
- Multi-network — Mainnet, Testnet and Regtest; the network is chosen when the wallet is created and
  fixed from then on, so several wallets can sit on different networks side by side
- Create from a fresh BIP-39 seed, restore from seed, or import from a Unified Full Viewing Key (read-only mode)
- Wallet seed phrase / UFVK backup viewer
- Per-wallet performance profiles
- Rescan from the Wallet menu, with a nonlinear scanning map on the dashboard showing sync progress

**Transactions**

- Full Zcash address support — Unified, Sapling, Transparent and TEX
- Shielded transactions by default (Ironwood / Sapling)
- Encrypted memos
- One-click shielding of the transparent balance
- Multi-send — several recipients in one transaction
- Any amount can be typed in USD instead of ZEC — in Send, in a payment request and in a swap; what is
  sent, requested or swapped is always ZEC
- Payment requests — a `zcash:` link and QR for an amount, a memo and an optional title, from Receive
- Scan a payment QR in Send — from an image (file, drag and drop, or a pasted screenshot) or the camera;
  decoded on the device, never stored or sent
- `zcash:` URI scheme handler (ZIP-321 payment requests, including several recipients)
- Transaction history, and a separate Messages view for transfers carrying memos; both searchable by
  address, contact name, memo or transaction id
- Receive lists every address of each pool, numbered ("2 of 5"), with a search across both pools once
  there is more than one
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
- The server list is searchable by address

**Privacy**

- Nym mixnet transport for sending a payment and for the price lookup, with a status indicator in
  the sidebar and an on/off control under Settings → Nym Mixnet. Syncing is not covered; what rides
  it and what does not is set out in [The Nym mixnet](#the-nym-mixnet)
- ZEC price is fetched over the mixnet only; while the transport is not ready the USD figures read
  `USD --` rather than falling back to clearnet
- Sending fails closed: a payment goes out over the mixnet, or not at all, unless the mixnet has been
  switched off deliberately. Shielding the transparent balance is a payment by another name and waits
  the same way

**Swaps** _(experimental, still under testing)_

- Swap ZEC to and from assets on other chains through SwapKit (NEAR Intents, Flashnet and other providers)
- Routes compared by cost against the market rate, with the slippage tolerance chosen and the slippage realised
- Swap status and history, with links to each chain's explorer and refund tracking
- When no route is offered, each provider's own reason is given (a minimum to reach, a provider that
  cannot price the pair right now), and a route already quoted is kept while it is still valid
- Deposit QR and payment link for paying an inbound swap from another wallet
- Swap traffic goes over clearnet, not the mixnet: see [docs/swap-privacy.md](docs/swap-privacy.md)

**Ironwood migration**

- Guided migration of Orchard funds to Ironwood, with progress on the dashboard
- Immediate migration for the straightforward case, and a scheduled, batched migration that spreads
  the transfer over time when privacy calls for it

**Address book**

- Save contacts per network (Mainnet / Testnet / Regtest) — the list filters by the active wallet's network
- "Show contacts from all networks" toggle to see everything at once
- Contacts on other chains too, with Swap To / Swap From — the chains that can be swapped with ZEC;
  an address on any other chain is refused by name
- Search contacts by any part of a name or an address, in the book and in the picker that fills an
  address field
- Scan a QR into the address field, for any asset, with the chain chosen when the code's payment link
  names it
- Save a contact from Send, Swap or a transaction's detail without leaving the screen
- A ZNS alias is saved as the address it resolves to, with the alias kept in the label

**Zcash Names (ZNS)** _(experimental)_

- Type `alice.zcash` in the recipient field — auto-resolves to the unified address via the public ZNS indexer
- Network-aware (`Mainnet` / `Testnet`), with a one-click link to the public ZNS explorer page
- Save the alias as a contact: it stores the address the alias resolves to at that moment, so a later
  change by the owner is not picked up

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

- DMG ↔ MAS first-launch migration assistant (macOS) — imports wallets, address book, settings and swap history from a previous DMG install
- deb/AppImage → Flatpak first-launch migration (Linux) — the same, without copying the wallet files, which the Flatpak reads where they are
- Manual "Import data from another installation" from the Settings menu (MAS / Flatpak), with per-item Replace / Merge / Skip choices
- Swap history moves with the rest. Each wallet's records are encrypted with a key derived from that wallet, so they travel with it — to another installation, another machine, or out of a backup. Records left by a version that encrypted them per installation are converted the next time their wallet is opened; until then they can only be read where they were written, and an import that cannot read them says so and leaves them there
- "Change wallets folder location" from the Settings menu (MAS)

---

## The Nym mixnet

Zingo PC bundles `nym-proxy` and starts it with the app. What the mixnet covers
is the two surfaces zingolib judged highest-linkage (its ADR 0011): sending a
payment, and fetching the price. Syncing is not one of them.

**Goes through the mixnet**

- **Broadcasting a payment.** The transaction is transmitted through the tunnel,
  so the indexer it is submitted to does not learn the IP it came from. This is
  what the mixnet is for: a broadcast is handed to the same indexer that has
  been serving your wallet, and without the tunnel that indexer sees a person
  and a transaction at the same address
- **Shielding the transparent balance**, which is a transmission like any other:
  the Shield button waits for the transport exactly as Send and Swap do
- **The transmissions of the Ironwood migration**, which are payments by another
  name and follow the same rule
- **The ZEC price.** Mixnet-only: no setting sends it over clearnet, and while
  the transport is not ready the USD figures read `USD --` rather than falling
  back

**Goes over clearnet**

- **Syncing.** Compact blocks, nullifiers, transparent-address queries, full
  transaction fetches, the mempool — the whole scan talks to your server
  directly. zingolib's ADR 0023 decided that the top of the chain should ride
  the mixnet and records that its implementation is deferred, so the server you
  sync from does see your IP. What the mixnet keeps from it is the IP behind a
  payment
- The server health check behind the sidebar indicator, which asks each server
  for its latest block over an ordinary connection
- Swap traffic: quotes, the commit, tracking, and the token catalog with its
  logos. The provider therefore sees the IP the request came from, beside the
  addresses a quote has to carry.
  The Swap screen says so, and [docs/swap-privacy.md](docs/swap-privacy.md) has
  the reasoning and what it would take to change
- Resolving a `name.zcash` alias, which asks the Zcash Name Service
- The server list, fetched from `hosh.zec.rocks` when you open the server picker
- Anything handed to your browser: a block explorer, or "Open in wallet" on a
  deposit
- The Nym client's own hostname lookups, which go to Quad9 and Cloudflare over
  DNS-over-TLS and DNS-over-HTTPS (see the antivirus entry under Troubleshooting)

If you want the rest covered too, that is a job for a system-level VPN or
NymVPN; the wallet does not embed one.

**Sending fails closed.** A payment goes out through the mixnet or not at all.
While the transport is bootstrapping, unattached or lost, sending refuses rather
than falling back — losing the transport is not consent to clearnet. That covers
shielding and a swap deposit too: the screens hold their buttons back and say
what they are waiting for, instead of letting the wallet refuse afterwards.

**Turning it on and off.** The sidebar carries the current state, and Settings →
Nym Mixnet turns the transport off and on. Switching it off also puts that
session's payments on clearnet, which is the one way a payment travels that way:
by being asked for. The choice is deliberately not saved, so the next launch
starts on the mixnet again.

---

## Troubleshooting

**Q: An older version of Zingo PC will not open my wallet any more**

A: Opening a wallet with a newer version can write it in a newer format, and that is one-way: the
older build refuses a file whose layout it does not know. Stay on the version you upgraded to, or
restore the wallet from its seed phrase in the older one — which is what the seed is for.

---

**Q: Clicking a `zcash:` payment link doesn't open Zingo PC (Linux AppImage)**

A: The AppImage must be launched at least once from its current location before the OS registers it as the handler for `zcash:` links. After the first launch, cold-start links work automatically. If you move the AppImage to a new path, launch it once from the new location to re-register it.

---

**Q: The camera does not open when scanning a payment QR**

A: Scanning from an image always works; the camera needs the operating system's permission.

- **macOS:** the first attempt asks. If it was refused, allow it in System Settings → Privacy & Security → Camera.
- **Windows:** allow it in Settings → Privacy & security → Camera, including "Let desktop apps access your camera".
- **Linux (Flatpak):** the sandbox grants device access at install; reinstall the Flatpak if it was denied.

If another app holds the camera, the dialog says so. There is no camera on the machine? Use "Choose image", drag an image in, or paste a screenshot.

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

Antivirus products that inspect HTTPS traffic cannot decrypt those connections, so they report that the site "may not be displayed correctly". Only hostname lookups travel over them; no wallet data is involved. To confirm, open the **Nym Mixnet** panel in the sidebar and press "Disable" — the connections stop for that session. Note the choice is deliberately not saved: the mixnet re-enables on the next launch, and so does the warning.

The fix is to allowlist those two hosts in your antivirus. Do not turn off Mixnet Mode just to silence it — that is what hides your IP from the indexer when you send.

Unrelated to this warning: always download releases from the [official Releases page](https://github.com/zingolabs/zingo-pc/releases) and check the digital signature. That, not an antivirus popup, is how you confirm your build is genuine.

---

**Q: Windows blocks Zingo PC from opening ("Smart App Control" or "Windows protected your PC")**

A: Expected on recent releases. Windows weighs **reputation**, not just whether a file is signed, and a signing certificate starts with no history — so early releases can be flagged exactly like unsigned ones. It clears as installs accumulate.

Before working around the warning, confirm the file is ours: right-click it → **Properties** → **Digital Signatures**. There should be a valid signature with a timestamp. And download only from the [Releases page](https://github.com/zingolabs/zingo-pc/releases) — a warning on a file from anywhere else is a different problem.

Then:

- **SmartScreen** (_"Windows protected your PC"_): **More info** → **Run anyway**.
- **Smart App Control** (clean installs of Windows 11 22H2+): no per-app exception exists. It can only be disabled entirely, and **cannot be re-enabled without reinstalling Windows** — we do not recommend it. Use the Microsoft Store build instead once it is published; Store packages are trusted by SAC from the first install.
