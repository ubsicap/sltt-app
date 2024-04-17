echo '%SLTT_CLIENT_DIR%'
wsl export SLTT_CLIENT_DIR="$(wslpath -a '%SLTT_CLIENT_DIR%')"; echo "$SLTT_CLIENT_DIR"
wsl cd "$(wslpath -a '%SLTT_CLIENT_DIR%')" && pwd && git checkout feat-client-sltt-app && yarn build:sltt-app:client