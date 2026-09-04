set -euo pipefail

readonly TARGETS='api frontend client landing worker cron'

usage() {
  echo "uso: [MARKER_PREFIX=refs/deploy/<env>] BASELINE=<sha> [FORCE_ALL=true] $0" >&2
  exit 2
}

paths_of() {
  case "$1" in
    # Spec 078: a API e as apps que validam o corpo dela sobem JUNTAS. O cliente valida por chaves
    # exatas — campo novo servido por uma ponta e desconhecido pela outra derruba a tela, e a guarda
    # nao pode ser afrouxada porque ela e defesa contra vazamento de token e de identidade de tenant.
    # A landing fica de fora: ela nao valida corpo da API.
    api) echo 'apps/api-transportada/ apps/frontend-transportada/ apps/frontend-client/ deploy/api/ deploy/keycloak/ realm/' ;;
    frontend) echo 'apps/frontend-transportada/ apps/api-transportada/ deploy/frontend/' ;;
    client) echo 'apps/frontend-client/ apps/api-transportada/' ;;
    landing) echo 'apps/frontend-landing/' ;;
    worker) echo 'apps/worker-transportada/ deploy/worker/' ;;
    cron) echo 'apps/cron-transportada/ deploy/cron/' ;;
    *) echo "alvo desconhecido: $1" >&2; exit 2 ;;
  esac
}

readonly SHARED_PATHS='package.json bun.lock .github/'

emit() {
  echo "$1=$2" >>"${GITHUB_OUTPUT:-/dev/stdout}"
  echo "$1=$2"
}

emit_all() {
  local reason="$1"
  echo "Publicando todos os alvos ($reason)."
  for target in $TARGETS; do
    emit "$target" true
  done
  emit reason "$reason"
}

is_commit() {
  [ -n "$1" ] && git cat-file -e "$1^{commit}" 2>/dev/null
}

# O baseline de um alvo é o commit em que **ele** subiu pela última vez, não o commit anterior do
# push: gate vermelho pula o deploy, e o push seguinte comparava contra um commit que nunca foi
# publicado — a mudança sumia do diff e o alvo ficava para trás em silêncio. Sem marco (ambiente
# novo, alvo que nunca subiu), cai no `BASELINE` do push; sem ele, publica.
baseline_of() {
  local target="$1"
  local marker="${MARKER_PREFIX:-}/$target"
  if [ -n "${MARKER_PREFIX:-}" ] && is_commit "$marker"; then
    git rev-parse "$marker^{commit}"
    return 0
  fi
  echo "${BASELINE:-}"
}

changed_since() {
  local baseline="$1"
  git diff --name-only "$baseline" HEAD
}

touches() {
  local changed="$1"
  local prefix="$2"
  echo "$changed" | grep -q "^$prefix"
}

main() {
  [ "$#" -eq 0 ] || usage

  if [ "${FORCE_ALL:-false}" = true ]; then
    emit_all 'pedido explícito'
    return 0
  fi

  if [ -z "${MARKER_PREFIX:-}" ] && ! is_commit "${BASELINE:-}"; then
    emit_all 'sem marco de deploy e sem baseline: não há como saber o que mudou'
    return 0
  fi

  local published=false
  for target in $TARGETS; do
    local baseline
    baseline="$(baseline_of "$target")"

    if ! is_commit "$baseline"; then
      echo "$target: sem baseline utilizável — publica."
      emit "$target" true
      published=true
      continue
    fi

    local changed
    if ! changed="$(changed_since "$baseline")"; then
      echo "$target: git diff falhou contra $baseline — publica."
      emit "$target" true
      published=true
      continue
    fi

    local hit=false
    for path in $SHARED_PATHS; do
      if touches "$changed" "$path"; then
        echo "$target: mudança em $path atinge toda app."
        hit=true
        break
      fi
    done

    if [ "$hit" = false ]; then
      for path in $(paths_of "$target"); do
        if touches "$changed" "$path"; then
          hit=true
          break
        fi
      done
    fi

    echo "$target: baseline $baseline → $hit"
    emit "$target" "$hit"
    [ "$hit" = true ] && published=true
  done

  emit reason "diff por alvo desde o último deploy de cada um"
  [ "$published" = true ] || echo 'Nada mudou desde o último deploy de cada alvo.'
}

main "$@"
