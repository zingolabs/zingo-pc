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

# Patch the system .desktop file so the zcash: handler uses the wrapper script
# from the very first click, before the user has ever opened the app manually.
DESKTOP='/usr/share/applications/zingo-pc.desktop'
if [ -f "$DESKTOP" ] && [ -f "$WRAPPER" ]; then
    sed -i "s|^Exec=.*|Exec=\"$WRAPPER\" %u|" "$DESKTOP"
    update-desktop-database /usr/share/applications 2>/dev/null || true
fi
