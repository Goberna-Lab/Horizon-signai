#!/usr/bin/env bash
# Espera a que el CI y el deploy de un commit terminen y dice cómo salieron.
# Uso: scripts/esperar-deploy.sh [sha]   (por defecto, HEAD)
# Sale 0 si el deploy terminó bien; 1 si el CI o el deploy fallaron; 2 si se agotó el tiempo.
set -euo pipefail

sha="$(git rev-parse --short "${1:-HEAD}")"
limite=$((SECONDS + 600))

while ((SECONDS < limite)); do
  estado="$(gh run list -L 10 --json workflowName,status,conclusion,headSha \
    --jq ".[] | select(.headSha | startswith(\"$sha\")) | \"\(.workflowName) \(.status) \(.conclusion)\"")"
  if grep -q "^ci completed failure" <<<"$estado"; then
    echo "✖ CI falló para $sha"; echo "$estado"; exit 1
  fi
  if grep -q "^deploy completed" <<<"$estado"; then
    echo "$estado"
    grep -q "^deploy completed success" <<<"$estado" && { echo "✔ desplegado $sha"; exit 0; }
    echo "✖ el deploy de $sha no salió bien"; exit 1
  fi
  sleep 10
done
echo "… se agotaron 10 min esperando el deploy de $sha"; echo "$estado"; exit 2
