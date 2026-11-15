#!/usr/bin/env bash
# Pide producción sin parar mientras corre un deploy y cuenta las respuestas fallidas (deploy/README.md).
# Uso: scripts/vigilar-deploy.sh [url]   y Ctrl-C cuando el deploy terminó (o scripts/esperar-deploy.sh en otra terminal).
# Fallida = sin respuesta (000) o 5xx. Un 4xx cuenta como bien: la app atendió.
# GET /api/health cada 0,2 s; POST /api/z6/chat con un cuerpo inválido cada 2 s (la app responde 400 sin llamar a
# la IA, y a ese ritmo no llega al límite de 60 por minuto por IP).
set -uo pipefail

url="${1:-https://signal-horizon.goberna.us}"
total=0 malos=0 n=0

resumen() {
  echo
  echo "$total pedidos, $malos fallidos"
  [ "$malos" -eq 0 ]
  exit
}
trap resumen INT

mirar() {
  local metodo="$1" codigo
  if [ "$metodo" = GET ]; then
    codigo="$(curl -s -o /dev/null -w '%{http_code}' -m 30 "$url/api/health")"
  else
    codigo="$(curl -s -o /dev/null -w '%{http_code}' -m 30 -X POST -H 'content-type: application/json' -d '{}' "$url/api/z6/chat")"
  fi
  total=$((total + 1))
  if [ "$codigo" = 000 ] || [ "${codigo:0:1}" = 5 ]; then
    malos=$((malos + 1))
    echo "$(date +%T) ✖ $metodo $codigo"
  fi
}

echo "vigilando $url (Ctrl-C para el resumen)"
while true; do
  mirar GET
  n=$((n + 1))
  ((n % 10 == 0)) && mirar POST
  sleep 0.2
done
