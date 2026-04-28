#!/bin/bash
set -e
POLICY_SRC='/opt/Zingo PC/resources/co.zingo.pc.policy'
POLICY_DST='/usr/share/polkit-1/actions/co.zingo.pc.policy'

if [ -f "$POLICY_SRC" ]; then
    cp "$POLICY_SRC" "$POLICY_DST"
    chmod 644 "$POLICY_DST"
fi
