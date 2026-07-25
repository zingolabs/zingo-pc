#!/bin/bash
rm -f '/usr/share/polkit-1/actions/co.zingo.pc.policy'

# Remove the terminal PATH symlink created in postinstall.sh. Guarded so we only
# delete it when it still points into our /opt install (never a user's own).
if [ -L /usr/bin/zingo-pc ] && [ "$(readlink /usr/bin/zingo-pc)" = '/opt/Zingo PC/zingo-pc' ]; then
    rm -f /usr/bin/zingo-pc
fi

# Unload and remove the AppArmor profile if present.
APPARMOR_DST='/etc/apparmor.d/zingo-pc'
if [ -f "$APPARMOR_DST" ]; then
    if command -v apparmor_parser >/dev/null 2>&1; then
        apparmor_parser -R "$APPARMOR_DST" 2>/dev/null || true
    fi
    rm -f "$APPARMOR_DST"
fi
