#!/usr/bin/env bash
# Copyright (c) 2026 Ada Technology. MIT License.
set -euo pipefail

# Quais alvos o commit mexeu, para o pipeline publicar e testar só o que mudou. A saída vai para o
# `$GITHUB_OUTPUT` como `<alvo>=true|false`.
#
# A regra que governa tudo aqui é a mesma que o passo do Keycloak aprendeu à força: **dúvida
# publica**. Baseline ausente, commit inalcançável ou `git diff` que falhou marcam todos os alvos,
# nunca nenhum. Pular por engano é o silêncio que custou quatro dias de tema de login fora do ar;
# publicar por engano custa alguns minutos de runner.

readonly TARGETS='api frontend landing worker cron'

usage() {
  echo "uso: BASELINE=<sha> [FORCE_ALL=true] $0" >&2
  exit 2
}

# Um alvo é o conjunto de caminhos que entram na imagem dele. A fonte da verdade é o `COPY` do
# Dockerfile de cada app: o build de um serviço enxerga a própria pasta em `apps/` mais os
# manifestos da raiz, e nada de outra app. Filtro mais largo que o `COPY` publica à toa; mais
# estreito publica imagem sem a mudança, que é o defeito caro.
paths_of() {
  case "$1" in
    # `deploy/keycloak/` e `realm/` entram aqui porque quem publica o Keycloak e reconcilia o realm
    # é o job da API, não um job próprio.
    api) echo 'apps/api-transportada/ deploy/api/ deploy/keycloak/ realm/' ;;
    frontend) echo 'apps/frontend-transportada/ deploy/frontend/' ;;
    landing) echo 'apps/frontend-landing/' ;;
    worker) echo 'apps/worker-transportada/ deploy/worker/' ;;
    cron) echo 'apps/cron-transportada/ deploy/cron/' ;;
    *) echo "alvo desconhecido: $1" >&2; exit 2 ;;
  esac
}

# Mexeu aqui, mexeu em todo mundo: o lockfile e o `package.json` da raiz entram em toda imagem pelo
# estágio `manifests`, e o próprio pipeline decide quem publica.
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

main() {
  [ "$#" -eq 0 ] || usage

  if [ "${FORCE_ALL:-false}" = true ]; then
    emit_all 'pedido explícito'
    return 0
  fi

  local baseline="${BASELINE:-}"
  if [ -z "$baseline" ]; then
    emit_all 'baseline ausente: não há como saber o que mudou'
    return 0
  fi
  if ! git cat-file -e "$baseline^{commit}" 2>/dev/null; then
    emit_all "baseline $baseline inalcançável: histórico truncado ou push forçado"
    return 0
  fi

  # Sem `2>/dev/null`: `git diff` que falha precisa aparecer. Foi o silêncio dele que fez o passo do
  # Keycloak ler a própria falha como "nada mudou".
  local changed
  if ! changed="$(git diff --name-only "$baseline" HEAD)"; then
    emit_all 'git diff falhou'
    return 0
  fi

  echo "Arquivos alterados desde $baseline:"
  echo "$changed" | sed 's/^/  /'

  for path in $SHARED_PATHS; do
    if echo "$changed" | grep -q "^$path"; then
      emit_all "mudança em $path atinge toda app"
      return 0
    fi
  done

  for target in $TARGETS; do
    local hit=false
    for path in $(paths_of "$target"); do
      if echo "$changed" | grep -q "^$path"; then
        hit=true
        break
      fi
    done
    emit "$target" "$hit"
  done
  emit reason 'diff por alvo'
}

main "$@"
