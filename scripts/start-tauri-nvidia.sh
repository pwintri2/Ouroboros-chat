#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_BIN="$APP_ROOT/src-tauri/target/release/ouroboros-chat"

if [[ ! -x "$APP_BIN" ]]; then
  echo "Ouroboros Chat release binary ontbreekt of is niet uitvoerbaar: $APP_BIN" >&2
  echo "Bouw hem eerst op de host met: cd $APP_ROOT && npm run tauri -- build" >&2
  exit 1
fi

if [[ -z "${OUROBOROS_CHAT_HOST_LAUNCH:-}" && -f "/.flatpak-info" ]] && command -v flatpak-spawn >/dev/null 2>&1; then
  exec flatpak-spawn --host env OUROBOROS_CHAT_HOST_LAUNCH=1 bash "$0" "$@"
fi

export __NV_PRIME_RENDER_OFFLOAD="${__NV_PRIME_RENDER_OFFLOAD:-1}"
export __GLX_VENDOR_LIBRARY_NAME="${__GLX_VENDOR_LIBRARY_NAME:-nvidia}"
export __VK_LAYER_NV_optimus="${__VK_LAYER_NV_optimus:-NVIDIA_only}"

# WebKitGTK can fail on NVIDIA/Wayland when the DMABuf renderer is enabled.
export WEBKIT_DISABLE_DMABUF_RENDERER="${WEBKIT_DISABLE_DMABUF_RENDERER:-1}"
export GDK_BACKEND="${GDK_BACKEND:-wayland,x11}"
export NO_AT_BRIDGE="${NO_AT_BRIDGE:-1}"

cd "$APP_ROOT"
exec "$APP_BIN" "$@"
