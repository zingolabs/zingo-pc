#!/bin/bash
rm -f '/usr/share/polkit-1/actions/co.zingo.pc.policy'

# Unload and remove the AppArmor profile if present.
APPARMOR_DST='/etc/apparmor.d/zingo-pc'
if [ -f "$APPARMOR_DST" ]; then
    if command -v apparmor_parser >/dev/null 2>&1; then
        apparmor_parser -R "$APPARMOR_DST" 2>/dev/null || true
    fi
    rm -f "$APPARMOR_DST"
fi
