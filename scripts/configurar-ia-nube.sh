#!/usr/bin/env bash
# Deja lista la IA en la nube de EVA y VERA: Claude (Anthropic) como cerebro y ElevenLabs como voz.
# Pide las claves sin mostrarlas, las prueba contra cada servicio, deja elegir la voz de cada asistente, las guarda
# como secretos del repo en GitHub y lanza el deploy: el deploy (que corre dentro de VPS2) las escribe en
# /srv/horizon-signai/ia-nube.env y reinicia las dos copias de la app de a una, sin cortes. No hace falta ssh: basta
# `gh` con una cuenta admin del repo. Qué usa cada ruta, cuánto cuesta y cómo volver atrás: voz/LEEME.md, «IA en la nube».
#
# Uso:
#   scripts/configurar-ia-nube.sh             claves → prueba → voces → GitHub → deploy → verificación
#   scripts/configurar-ia-nube.sh --estado    qué cerebro y qué voz atienden ahora en producción
#   scripts/configurar-ia-nube.sh --apagar    vuelve a Ollama y a la voz local sin borrar las claves (gasto cero)
#   scripts/configurar-ia-nube.sh --encender  vuelve a Claude y ElevenLabs
#   scripts/configurar-ia-nube.sh --local     las guarda en apps/api/.env (para `npm run dev`)
#   scripts/configurar-ia-nube.sh --ssh       las escribe directo en el .env de VPS2 por ssh + sudo, sin GitHub
#
# Variables, todas opcionales:
#   ANTHROPIC_API_KEY, ELEVENLABS_API_KEY                     si ya están exportadas, no se preguntan
#   ELEVENLABS_VOZ_EDUCATIONAL, ELEVENLABS_VOZ_ASSISTANT      ID de la voz de EVA y de VERA, sin preguntar
#   HORIZON_REPO                 repo de GitHub (por defecto Goberna-Lab/Horizon-signai)
#   HORIZON_SSH                  con --ssh: host de VPS2 (por defecto `vps2`, el alias del equipo)
#   Solo con --ssh y --local (por GitHub valen los de por defecto del API):
#   CLAUDE_MODELO_VOZ (claude-haiku-5-5), CLAUDE_MODELO_TEXTO (claude-sonnet-5-5), ELEVENLABS_MODELO (eleven_flash_v2_5)
#   CLAUDE_MAX_PEDIDOS_DIA (3000), ELEVENLABS_MAX_CARACTERES_DIA (60000)
#                                topes diarios: pasado el tope, el API vuelve a la IA y la voz locales hasta mañana
#
# Las claves nunca se imprimen ni van en una línea de comandos (no aparecen en `ps` ni en el historial): viajan por
# stdin a `gh secret set` (o, con --ssh, a un archivo 600 en tu home de VPS2 que se borra al terminar).
set -euo pipefail

SITIO="${HORIZON_SITIO:-https://signal-horizon.goberna.us}"
HOST="${HORIZON_SSH:-vps2}"
REPO="${HORIZON_REPO:-Goberna-Lab/Horizon-signai}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANTHROPIC="${ANTHROPIC_BASE_URL:-https://api.anthropic.com}"
ELEVEN="${ELEVENLABS_URL:-https://api.elevenlabs.io}"

M_VOZ="${CLAUDE_MODELO_VOZ:-claude-haiku-5-5}"
M_TEXTO="${CLAUDE_MODELO_TEXTO:-claude-sonnet-5-5}"
M_ELEVEN="${ELEVENLABS_MODELO:-eleven_flash_v2_5}"
TOPE_CLAUDE="${CLAUDE_MAX_PEDIDOS_DIA:-3000}"
TOPE_ELEVEN="${ELEVENLABS_MAX_CARACTERES_DIA:-60000}"
VOZ_DEFECTO="EXAVITQu4vr4xnSDxMaL" # Sarah, prediseñada de ElevenLabs (la misma que usa el API si no hay otra)

ok() { printf '✔ %s\n' "$*"; }
info() { printf '· %s\n' "$*"; }
mal() { printf '✖ %s\n' "$*" >&2; }

TMP=""
limpiar() { [ -n "$TMP" ] && rm -rf "$TMP"; }
trap limpiar EXIT

# GET o POST con cabeceras secretas: van por stdin a curl (`-H @-`), nunca como argumento. Deja el cuerpo en
# $TMP/cuerpo y escribe el código HTTP. Uso: http URL "Cabecera: valor" ["Otra: valor"…] [-- cuerpo-json]
http() {
  local url="$1" cabeceras="" cuerpo=""
  shift
  while [ $# -gt 0 ]; do
    if [ "$1" = "--" ]; then cuerpo="$2"; break; fi
    cabeceras="$cabeceras$1"$'\n'
    shift
  done
  if [ -n "$cuerpo" ]; then
    printf '%s' "$cabeceras" | curl -sS -m 30 -o "$TMP/cuerpo" -w '%{http_code}' -H @- \
      -H 'Content-Type: application/json' --data-binary "$cuerpo" "$url" || echo 000
  else
    printf '%s' "$cabeceras" | curl -sS -m 30 -o "$TMP/cuerpo" -w '%{http_code}' -H @- "$url" || echo 000
  fi
}

# Lee un secreto sin mostrarlo. Si la variable ya está exportada, la usa.
pedir_secreto() { # $1: variable, $2: pregunta
  local actual
  eval "actual=\"\${$1:-}\""
  if [ -n "$actual" ]; then
    info "$1: la tomo del entorno"
    return
  fi
  local valor=""
  read -r -s -p "$2: " valor || true
  echo
  valor="$(printf '%s' "$valor" | tr -d '[:space:]')"
  eval "$1=\"\$valor\""
}

json() { # $1: archivo, $2: expresión JS sobre `d`
  node -e 'const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); const r = eval(process.argv[2]); if (r !== undefined) console.log(r)' "$1" "$2"
}

# ── Claude ──────────────────────────────────────────────────────────────────────────────────────────────────────────
probar_anthropic() {
  local m codigo
  for m in "$M_VOZ" "$M_TEXTO"; do
    codigo="$(http "$ANTHROPIC/v1/models/$m" "x-api-key: $ANTHROPIC_API_KEY" "anthropic-version: 2023-06-01")"
    case "$codigo" in
      200) ok "Claude: la clave sirve y la cuenta tiene $m" ;;
      401) mal "Claude: la clave no es válida (401)"; return 1 ;;
      403) mal "Claude: la clave no tiene permiso (403). ¿Es de un workspace sin acceso a la API?"; return 1 ;;
      404) mal "Claude: la cuenta no tiene el modelo $m (404). Cambia CLAUDE_MODELO_VOZ / CLAUDE_MODELO_TEXTO"; return 1 ;;
      *) mal "Claude: api.anthropic.com respondió $codigo"; return 1 ;;
    esac
  done
}

# ── ElevenLabs ──────────────────────────────────────────────────────────────────────────────────────────────────────
listar_voces() {
  local codigo
  codigo="$(http "$ELEVEN/v2/voices?page_size=100" "xi-api-key: $ELEVENLABS_API_KEY")"
  case "$codigo" in
    200) ;;
    401)
      if grep -q "permission" "$TMP/cuerpo" 2>/dev/null; then
        info "ElevenLabs: la clave no puede listar voces (permiso voices_read). Escribe el ID de cada voz."
        : >"$TMP/voces.tsv"
        return 0
      fi
      mal "ElevenLabs: la clave no es válida (401)"
      return 1
      ;;
    *) mal "ElevenLabs respondió $codigo al listar voces"; return 1 ;;
  esac
  json "$TMP/cuerpo" '(d.voices || []).map((v, i) => { const l = v.labels || {}; return [i + 1, v.voice_id, v.name, v.category, [l.gender, l.age, l.accent, l.use_case || l["use case"]].filter(Boolean).join(", ")].join("\t") }).join("\n")' >"$TMP/voces.tsv"
  local n
  n="$(grep -c . "$TMP/voces.tsv" || true)"
  ok "ElevenLabs: la clave sirve ($n voces en la cuenta)"
  if [ "$(http "$ELEVEN/v1/user/subscription" "xi-api-key: $ELEVENLABS_API_KEY")" = 200 ]; then
    info "Plan: $(json "$TMP/cuerpo" '`${d.tier}, ${d.character_count} de ${d.character_limit} caracteres usados este mes`')"
  fi
  printf '\n'
  awk -F '\t' '{ printf "  %3s) %-22s %-10s %s\n", $1, $3, $4, $5 }' "$TMP/voces.tsv"
  printf '\n'
}

elegir_voz() { # $1: variable, $2: quién
  local actual elegido="" r defecto defecto_nombre
  eval "actual=\"\${$1:-}\""
  if [ -n "$actual" ]; then
    info "$2: $actual (del entorno)"
    return
  fi
  defecto="$(awk -F '\t' '$3 ~ /^Sarah/ { print $2; exit }' "$TMP/voces.tsv")"
  [ -n "$defecto" ] || defecto="$(awk -F '\t' 'NR == 1 { print $2 }' "$TMP/voces.tsv")"
  [ -n "$defecto" ] || defecto="$VOZ_DEFECTO"
  defecto_nombre="$(awk -F '\t' -v id="$defecto" '$2 == id { print $3 }' "$TMP/voces.tsv")"
  read -r -p "Voz de $2 [número o ID; Enter = ${defecto_nombre:-$defecto}]: " r || true
  r="$(printf '%s' "$r" | tr -d '[:space:]')"
  if [ -z "$r" ]; then
    elegido="$defecto"
  elif printf '%s' "$r" | grep -qE '^[0-9]+$'; then
    elegido="$(awk -F '\t' -v n="$r" '$1 == n { print $2 }' "$TMP/voces.tsv")"
    [ -n "$elegido" ] || { mal "no hay voz número $r"; elegir_voz "$1" "$2"; return; }
  else
    elegido="$r"
  fi
  eval "$1=\"\$elegido\""
}

# Una palabra con cada voz elegida (unos 10 caracteres): prueba la clave, la voz y el modelo como los usa el API.
probar_voz() { # $1: id de voz, $2: quién, $3: texto, $4: idioma
  local codigo
  codigo="$(http "$ELEVEN/v1/text-to-speech/$1/with-timestamps?output_format=mp3_44100_64" "xi-api-key: $ELEVENLABS_API_KEY" -- \
    "{\"text\":\"$3\",\"model_id\":\"$M_ELEVEN\",\"language_code\":\"$4\"}")"
  if [ "$codigo" = 200 ]; then
    ok "ElevenLabs: $2 habla con $M_ELEVEN"
    return 0
  fi
  mal "ElevenLabs: la voz de $2 ($1) con $M_ELEVEN respondió $codigo: $(head -c 300 "$TMP/cuerpo" 2>/dev/null)"
  return 1
}

# ── Escribir el .env ────────────────────────────────────────────────────────────────────────────────────────────────
# El script que corre en el servidor (con sudo) o en local. $1: líneas CLAVE=valor; $2: claves a quitar.
# Quita del .env las claves que reescribe y las de $2, agrega las nuevas al final y reinicia app-b y después app-a.
carga() {
  cat <<'__INICIO__'
set -euo pipefail
DIR="${HORIZON_DIR:-/srv/horizon-signai}"
ENV="$DIR/.env"
# Los respaldos van FUERA de la carpeta de la app: ahí entrarían en la imagen de Docker (.dockerignore solo excluye .env).
RESPALDOS="${HORIZON_RESPALDOS-/var/backups/horizon-signai}"
__INICIO__
  printf 'QUITAR=%q\n' "$2"
  printf "NUEVAS=\"\$(cat <<'__VALORES__'\n%s\n__VALORES__\n)\"\n" "$1"
  cat <<'__FIN__'
[ -f "$ENV" ] || { echo "✖ no existe $ENV" >&2; exit 1; }
if [ -n "$RESPALDOS" ]; then
  install -d -m 700 "$RESPALDOS"
  cp -p "$ENV" "$RESPALDOS/env.$(date +%Y%m%d-%H%M%S)"
  echo "· respaldo del .env anterior en $RESPALDOS"
fi
claves="$( { if [ -n "$NUEVAS" ]; then printf '%s\n' "$NUEVAS" | cut -d= -f1; fi; for k in $QUITAR; do echo "$k"; done; } | sort -u | paste -sd'|' -)"
if [ -n "$claves" ]; then
  tmp="$(mktemp)"
  grep -vE "^(${claves})=" "$ENV" >"$tmp" || true
  if [ -n "$NUEVAS" ]; then printf '%s\n' "$NUEVAS" >>"$tmp"; fi
  cat "$tmp" >"$ENV" # así el .env conserva su dueño y sus permisos
  rm -f "$tmp"
fi
echo "✔ $ENV: $(printf '%s' "$claves" | tr '|' ' ')"
[ -z "${HORIZON_SIN_REINICIO:-}" ] || exit 0
cd "$DIR"
# Una copia por vez (deploy/README.md): mientras se reemplaza una, nginx atiende con la otra.
for copia in app-b app-a; do
  echo "· reiniciando $copia con el .env nuevo…"
  docker compose -f docker-compose.prod.yml up -d --no-deps --wait --wait-timeout 120 --force-recreate "$copia"
done
echo "✔ las dos copias de la app ya leen el .env nuevo"
__FIN__
}

subir() { # $1: nuevas, $2: quitar
  info "Subiendo a $HOST:/srv/horizon-signai/.env (puede pedirte la clave de sudo)…"
  local remoto
  remoto="$(carga "$1" "$2" | ssh -o ConnectTimeout=15 "$HOST" 'umask 077 && f="$(mktemp "$HOME/.horizon-ia.XXXXXX")" && cat >"$f" && echo "$f"')" || {
    mal "no pude entrar por ssh a $HOST. Si tu alias no es vps2: HORIZON_SSH=usuario@host $0"
    exit 1
  }
  if ! ssh -t -o ConnectTimeout=15 "$HOST" "sudo bash '$remoto'; e=\$?; rm -f '$remoto'; exit \$e"; then
    mal "falló en el servidor. Si se cortó la conexión, borra a mano $HOST:$remoto (tiene las claves)"
    exit 1
  fi
}

guardar_local() { # $1: nuevas, $2: quitar
  local env="$RAIZ/apps/api/.env"
  [ -f "$env" ] || (umask 077 && : >"$env")
  chmod 600 "$env"
  carga "$1" "$2" | HORIZON_DIR="$RAIZ/apps/api" HORIZON_RESPALDOS="" HORIZON_SIN_REINICIO=1 bash
  ok "Listo. \`npm run dev\` las lee de apps/api/.env (no se sube a git ni entra en la imagen)."
}

# ── GitHub: secretos y variables del repo, que el deploy escribe en ia-nube.env ────────────────────────────────────
github_listo() {
  command -v gh >/dev/null || { mal "falta GitHub CLI: brew install gh && gh auth login"; exit 1; }
  local admin
  admin="$(gh api "repos/$REPO" --jq .permissions.admin 2>/dev/null || echo false)"
  if [ "$admin" != true ]; then
    mal "tu cuenta de GitHub no es admin de $REPO (o falta \`gh auth login\`): no puede guardar los secretos"
    exit 1
  fi
}

# $1: líneas CLAVE=valor; $2: variables a borrar. Las claves van como secretos y lo demás como variables; el deploy
# solo lee las de deploy.yml (claves, voces, IA_MOTOR, VOZ_MOTOR): modelos y topes quedan con los del API.
guardar_en_github() {
  local linea k v
  while IFS= read -r linea; do
    [ -n "$linea" ] || continue
    k="${linea%%=*}"
    v="${linea#*=}"
    case "$k" in
      *_API_KEY)
        if printf '%s' "$v" | gh secret set "$k" -R "$REPO" >/dev/null; then ok "GitHub: secreto $k guardado"; else mal "GitHub no guardó $k"; exit 1; fi
        ;;
      ELEVENLABS_VOZ_* | IA_MOTOR | VOZ_MOTOR)
        if gh variable set "$k" -R "$REPO" --body "$v" >/dev/null; then ok "GitHub: $k=$v"; else mal "GitHub no guardó $k"; exit 1; fi
        ;;
    esac
  done <<<"$1"
  for k in $2; do
    gh variable delete "$k" -R "$REPO" >/dev/null 2>&1 && ok "GitHub: $k borrada" || true
  done
}

# Lanza el deploy de main y espera a que termine (unos minutos: reconstruye y reinicia las dos copias).
desplegar() {
  local desde id="" i
  desde="$(node -e 'console.log(new Date(Date.now() - 60000).toISOString())')"
  gh workflow run deploy.yml -R "$REPO" --ref main >/dev/null
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    sleep 3
    id="$(gh run list -R "$REPO" --workflow deploy.yml --event workflow_dispatch -L 5 --json databaseId,createdAt \
      --jq "[.[] | select(.createdAt >= \"$desde\")][0].databaseId // empty")"
    [ -z "$id" ] || break
  done
  [ -n "$id" ] || { mal "GitHub no muestra el deploy que lancé: míralo en https://github.com/$REPO/actions"; exit 1; }
  info "Desplegando a producción (3 a 5 minutos): https://github.com/$REPO/actions/runs/$id"
  if gh run watch "$id" -R "$REPO" --exit-status --interval 10 >/dev/null 2>&1; then
    ok "Deploy terminado"
  else
    mal "el deploy falló: https://github.com/$REPO/actions/runs/$id (la app sigue con la versión anterior)"
    exit 1
  fi
}

# ── Verificar ───────────────────────────────────────────────────────────────────────────────────────────────────────
estado() {
  local codigo
  codigo="$(curl -sS -m 15 -o "$TMP/motores" -w '%{http_code}' "$SITIO/api/z6/motores" || echo 000)"
  if [ "$codigo" != 200 ]; then
    info "$SITIO todavía no tiene el código de la IA en la nube (/api/z6/motores respondió $codigo)."
    info "Las claves ya quedaron en el .env: se usan apenas se despliegue la rama (merge a main)."
    return 1
  fi
  json "$TMP/motores" '[
    d.ia === "claude"
      ? `Cerebro: Claude (voz ${d.claude.voz}, texto ${d.claude.texto}), ${d.claude.pedidosHoy} de ${d.claude.tope} pedidos hoy`
      : `Cerebro: Ollama (voz ${d.ollama.voz} en la Z6, texto ${d.ollama.texto} en Geografo)${d.claude.configurado ? ", Claude configurado pero apagado o sin tope" : ""}`,
    d.voz === "elevenlabs"
      ? `Voz: ElevenLabs (${d.elevenlabs.modelo}), ${d.elevenlabs.caracteresHoy} de ${d.elevenlabs.tope} caracteres hoy`
      : `Voz: local (Kokoro en Geografo)${d.elevenlabs.configurado ? `, ElevenLabs configurado pero apagado${d.elevenlabs.pausadoHasta ? " (pausado tras un error hasta " + d.elevenlabs.pausadoHasta + ")" : " o sin tope"}` : ""}`,
  ].join("\n")'
}

# Una pregunta corta y una frase de voz contra producción (unos pocos centavos de dólar como mucho).
probar_en_vivo() {
  local codigo
  info "Probando en vivo contra ${SITIO}…"
  codigo="$(curl -sS -m 60 -o "$TMP/chat" -w '%{http_code}' -H 'Content-Type: application/json' \
    --data '{"messages":[{"role":"user","content":"In one short sentence: who are you?"}],"asistente":"educational"}' \
    "$SITIO/api/z6/chat" || echo 000)"
  if [ "$codigo" = 200 ]; then
    json "$TMP/chat" '`  chat: ${d.equipo} ${d.modelo} en ${d.ms} ms: «${d.respuesta}»`'
  else
    mal "chat respondió $codigo: $(head -c 300 "$TMP/chat")"
  fi
  codigo="$(curl -sS -m 60 -o "$TMP/decir" -w '%{http_code}' -H 'Content-Type: application/json' \
    --data '{"texto":"Hello, I am EVA, your guide.","asistente":"educational","formato":"mp3"}' \
    "$SITIO/api/z6/decir" || echo 000)"
  if [ "$codigo" = 200 ]; then
    node -e 'const l = require("fs").readFileSync(process.argv[1], "utf8").trim().split("\n").map((x) => JSON.parse(x)); const f = l.find((e) => e.t === "frase"); console.log(f ? `  voz: ${f.mime}, ${f.palabras.length} palabras con tiempo, ${f.dur} s` : "  voz: sin frase")' "$TMP/decir"
  else
    mal "decir respondió $codigo: $(head -c 300 "$TMP/decir")"
  fi
}

# ── Pasos ───────────────────────────────────────────────────────────────────────────────────────────────────────────
configurar() { # $1: github | ssh | local
  local nuevas="" quitar="" r
  [ "$1" != github ] || github_listo
  echo "IA en la nube para EVA y VERA. Pega cada clave y Enter (no se ve al pegarla). Enter sin nada = saltar esa parte."
  echo
  pedir_secreto ANTHROPIC_API_KEY "Clave de Anthropic para Claude (sk-ant-…)"
  if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    probar_anthropic
    nuevas="${nuevas}ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"$'\n'"CLAUDE_MODELO_VOZ=$M_VOZ"$'\n'"CLAUDE_MODELO_TEXTO=$M_TEXTO"$'\n'"CLAUDE_MAX_PEDIDOS_DIA=$TOPE_CLAUDE"$'\n'
    quitar="$quitar IA_MOTOR"
  fi
  echo
  pedir_secreto ELEVENLABS_API_KEY "Clave de ElevenLabs"
  if [ -n "${ELEVENLABS_API_KEY:-}" ]; then
    listar_voces
    elegir_voz ELEVENLABS_VOZ_EDUCATIONAL "EVA (la guía)"
    elegir_voz ELEVENLABS_VOZ_ASSISTANT "VERA (la de misión; el navegador le suma el timbre de robot)"
    probar_voz "$ELEVENLABS_VOZ_EDUCATIONAL" "EVA" "Hello!" en
    probar_voz "$ELEVENLABS_VOZ_EDUCATIONAL" "EVA en español" "¡Hola!" es
    probar_voz "$ELEVENLABS_VOZ_ASSISTANT" "VERA" "Noted." en
    nuevas="${nuevas}ELEVENLABS_API_KEY=$ELEVENLABS_API_KEY"$'\n'"ELEVENLABS_MODELO=$M_ELEVEN"$'\n'"ELEVENLABS_VOZ_EDUCATIONAL=$ELEVENLABS_VOZ_EDUCATIONAL"$'\n'"ELEVENLABS_VOZ_ASSISTANT=$ELEVENLABS_VOZ_ASSISTANT"$'\n'"ELEVENLABS_MAX_CARACTERES_DIA=$TOPE_ELEVEN"$'\n'
    quitar="$quitar VOZ_MOTOR"
  fi
  nuevas="${nuevas%$'\n'}"
  if [ -z "$nuevas" ]; then
    info "No diste ninguna clave: nada que hacer."
    exit 0
  fi
  echo
  echo "Se va a guardar (las claves no se muestran):"
  printf '%s\n' "$nuevas" | { if [ "$1" = github ]; then grep -E '^(ANTHROPIC_API_KEY|ELEVENLABS_API_KEY|ELEVENLABS_VOZ_)'; else cat; fi; } |
    sed -E 's/^([A-Z_]*API_KEY)=.*/\1=••••••••/; s/^/  /'
  echo
  if [ "$1" = local ]; then
    guardar_local "$nuevas" "$quitar"
    return
  fi
  if [ "$1" = github ]; then
    read -r -p "¿Guardar en GitHub y poner en producción? [s/N] " r || true
    case "$r" in s | S | si | sí | y | Y) ;; *) info "No se guardó nada."; exit 0 ;; esac
    guardar_en_github "$nuevas" "$quitar"
    desplegar
  else
    read -r -p "¿Subir a $HOST y reiniciar la app (una copia por vez, sin cortes)? [s/N] " r || true
    case "$r" in s | S | si | sí | y | Y) ;; *) info "No se subió nada."; exit 0 ;; esac
    subir "$nuevas" "$quitar"
  fi
  echo
  if estado; then probar_en_vivo; fi
}

principal() {
  TMP="$(mktemp -d)"
  case "${1:-}" in
    "") configurar github ;;
    --ssh) configurar ssh ;;
    --local) configurar local ;;
    --estado) estado ;;
    --apagar)
      github_listo
      guardar_en_github $'IA_MOTOR=ollama\nVOZ_MOTOR=local' ""
      desplegar
      estado || true
      ;;
    --encender)
      github_listo
      guardar_en_github "" "IA_MOTOR VOZ_MOTOR"
      desplegar
      estado || true
      ;;
    -h | --help) sed -n '2,/^set -euo/p' "$0" | sed -e '$d' -e 's/^# \{0,1\}//' ;;
    *) mal "opción desconocida: $1 (ver --help)"; exit 2 ;;
  esac
}

# Se puede cargar con `source` para probar las funciones sin correr nada.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then principal "$@"; fi
