#!/bin/bash
set -e
POLICY_SRC='/opt/Zingo PC/resources/co.zingo.pc.policy'
POLICY_DST='/usr/share/polkit-1/actions/co.zingo.pc.policy'

if [ -f "$POLICY_SRC" ]; then
    cp "$POLICY_SRC" "$POLICY_DST"
    chmod 644 "$POLICY_DST"
fi

WRAPPER='/opt/Zingo PC/resources/zingo-pc-uri.sh'
if [ -f "$WRAPPER" ]; then
    chmod +x "$WRAPPER"
fi

# Make chrome-sandbox SUID root so Chromium's process sandbox works on
# Ubuntu 22.04+ / Debian 11+ which restrict unprivileged user namespaces.
CHROME_SANDBOX='/opt/Zingo PC/chrome-sandbox'
if [ -f "$CHROME_SANDBOX" ]; then
    chown root "$CHROME_SANDBOX"
    chmod 4755 "$CHROME_SANDBOX"
fi

# Install AppArmor profile so Chromium can create user namespaces on
# Ubuntu 24.04+ / Debian 13+ (kernel.apparmor_restrict_unprivileged_userns=1).
# Without this, the app crashes on launch with zygote_host_impl_linux.cc:207.
APPARMOR_SRC='/opt/Zingo PC/resources/apparmor-zingo-pc'
APPARMOR_DST='/etc/apparmor.d/zingo-pc'
if [ -f "$APPARMOR_SRC" ] && [ -d /etc/apparmor.d ]; then
    cp "$APPARMOR_SRC" "$APPARMOR_DST"
    chmod 644 "$APPARMOR_DST"
    if command -v apparmor_parser >/dev/null 2>&1; then
        apparmor_parser -r "$APPARMOR_DST" 2>/dev/null || true
    fi
fi

# Put `zingo-pc` on the PATH so it can be launched from a terminal. electron
# installs the binary under a spaced /opt directory (/opt/Zingo PC/zingo-pc),
# which is not on the PATH; this symlink makes `zingo-pc` work like any CLI.
# Removed again in postremove.sh.
BINARY='/opt/Zingo PC/zingo-pc'
if [ -f "$BINARY" ] && [ -d /usr/bin ]; then
    ln -sf "$BINARY" /usr/bin/zingo-pc
fi

# Why the launcher points at a wrapper script, not the binary directly:
# the app registers the `zcash:` URI scheme (payment links). When you click a
# zcash: link, the desktop passes the URI as an argument; the wrapper
# (zingo-pc-uri.sh) normalizes it and forwards it to the real binary. We patch
# the system .desktop Exec here so this works from the very first click, before
# the user has ever opened the app manually. For a plain launch (no URI) you can
# call the binary — or the `zingo-pc` symlink above — directly; the wrapper is
# only needed for zcash: deep-link handling.
DESKTOP='/usr/share/applications/zingo-pc.desktop'
if [ -f "$DESKTOP" ] && [ -f "$WRAPPER" ]; then
    sed -i "s|^Exec=.*|Exec=\"$WRAPPER\" %u|" "$DESKTOP"
    update-desktop-database /usr/share/applications 2>/dev/null || true
fi
