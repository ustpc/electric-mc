#!/bin/sh
# Registers the live log helper (log-host.mjs) with Google Chrome, for the
# unpacked test build in build/chrome-mv3. Run with `make install-log-host`;
# `make uninstall-log-host` removes it.
#
# Chrome only lets the extension IDs named here start the helper. An unpacked
# extension's ID comes from the folder it was loaded from, so it is computed
# from build/chrome-mv3; pass EXT_ID=... if chrome://extensions shows another.
set -eu

HOST=org.electric_mc.log
HERE=$(cd "$(dirname "$0")" && pwd -P)
EXT_DIR=$(cd "$HERE/../.." && pwd -P)

case "$(uname -s)" in
  Darwin)
    CHROME_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    APP_DIR="$HOME/Library/Application Support/Electric MC" ;;
  *)
    CHROME_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    APP_DIR="$HOME/.local/share/electric-mc" ;;
esac

if [ "${1:-}" = "--uninstall" ]; then
  rm -f "$CHROME_DIR/$HOST.json" "$APP_DIR/log-host"
  echo "Removed the live log helper."
  exit 0
fi

NODE=$(command -v node) || { echo "node not found" >&2; exit 1; }
mkdir -p "$EXT_DIR/build/chrome-mv3"
ID=${EXT_ID:-$("$NODE" "$HERE/extension-id.mjs" "$EXT_DIR/build/chrome-mv3")}

# Chrome starts the helper with a bare environment, so name node by its full path.
mkdir -p "$APP_DIR" "$CHROME_DIR"
cat > "$APP_DIR/log-host" <<SH
#!/bin/sh
exec "$NODE" "$HERE/log-host.mjs"
SH
chmod 755 "$APP_DIR/log-host"

cat > "$CHROME_DIR/$HOST.json" <<JSON
{
  "name": "$HOST",
  "description": "Electric MC live log (developer mode)",
  "path": "$APP_DIR/log-host",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$ID/"]
}
JSON

echo "Installed the live log helper for extension $ID."
echo "Check that chrome://extensions shows that ID for Electric MC; if not, run: make install-log-host EXT_ID=<its ID>"
echo "Then reload Electric MC and turn on Developer mode. The log goes to $(cd "$EXT_DIR/.." && pwd -P)/var/electric-mc.log"
