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

SNAP_GNOME_LIB="/snap/gnome-46-2404/current/usr/lib/x86_64-linux-gnu"
SNAP_MESA_LIB="/snap/mesa-2404/current/usr/lib/x86_64-linux-gnu"
SNAP_CORE_LIB="/snap/core24/current/usr/lib/x86_64-linux-gnu"
RUNTIME_LIB_DIR="$HOME/.cache/tauri-runtime-libs"
APPIMAGE_LIB_DIR="$APP_ROOT/src-tauri/target/release/bundle/appimage/Ouroboros Chat.AppDir/usr/lib"
COCKPIT_APPIMAGE_LIB_DIR="${WINTRIP_ROOT:-/home/pwintri2/WintripAI}/ouroboros_cockpit/src-tauri/target/debug/bundle/appimage/Ouroboros Cockpit.AppDir/usr/lib"

for lib_dir in "$APPIMAGE_LIB_DIR" "$COCKPIT_APPIMAGE_LIB_DIR"; do
  if [[ -d "$lib_dir" ]]; then
    export LD_LIBRARY_PATH="$lib_dir:${LD_LIBRARY_PATH:-}"
  fi
done

if [[ -d "$SNAP_GNOME_LIB" && -d "$SNAP_MESA_LIB" ]]; then
  mkdir -p "$RUNTIME_LIB_DIR"
  for lib_name in libbsd.so.0 libkeyutils.so.1 libmd.so.0; do
    if [[ -e "$SNAP_CORE_LIB/$lib_name" ]]; then
      ln -sf "$SNAP_CORE_LIB/$lib_name" "$RUNTIME_LIB_DIR/$lib_name"
    fi
  done
  export LD_LIBRARY_PATH="$RUNTIME_LIB_DIR:$SNAP_GNOME_LIB:$SNAP_MESA_LIB:${LD_LIBRARY_PATH:-}"
fi

cd "$APP_ROOT"
exec "$APP_BIN" "$@"
