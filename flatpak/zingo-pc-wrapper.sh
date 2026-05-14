#!/bin/bash
# zypak replaces the Chrome sandbox mechanism inside the Flatpak sandbox.
# Provided by org.electronjs.Electron2.BaseApp.
exec zypak-wrapper /app/lib/zingo-pc/zingo-pc "$@"
