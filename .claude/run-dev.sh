#!/bin/sh
export PATH="$HOME/.local/share/fnm/node-versions/v24.18.0/installation/bin:$PATH"
exec npx vite dev --port "${PORT:-3000}"
