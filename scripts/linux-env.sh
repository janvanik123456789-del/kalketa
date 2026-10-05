#!/usr/bin/env bash
# Environment of the Linux checks (WSL Ubuntu): Node 24 from the user's home
# (unpacked from nodejs.org into ~/.local/node), no Windows tools on the PATH.
export PATH="$HOME/.local/node/bin:/usr/local/bin:/usr/bin:/bin"
export ELECTRON_DISABLE_SECURITY_WARNINGS=1
