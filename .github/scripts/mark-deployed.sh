set -euo pipefail

# O marco de um alvo é o commit em que ele está publicado. Ele avança em dois casos, e só neles:
# o deploy passou, ou não havia o que publicar (o diff não marcou o alvo, então o que está no ar já
# é o conteúdo deste commit). Gate vermelho, deploy falho ou cancelado **não** avançam — é
# justamente o que faz a mudança continuar no diff do push seguinte em vez de sumir em silêncio.
readonly TARGETS='api frontend landing client worker cron'

usage() {
  echo "uso: ENVIRONMENT=<env> <TARGET>_CHANGED=<bool> <TARGET>_RESULT=<result> $0" >&2
  exit 2
}

[ "$#" -eq 0 ] || usage
[ -n "${ENVIRONMENT:-}" ] || usage

upper() {
  echo "$1" | tr '[:lower:]' '[:upper:]'
}

for target in $TARGETS; do
  name="$(upper "$target")"
  eval "changed=\${${name}_CHANGED:-}"
  eval "result=\${${name}_RESULT:-}"

  if [ "$changed" != true ]; then
    reason='nada a publicar neste commit'
  elif [ "$result" = success ]; then
    reason='deploy verde'
  else
    echo "$target: marco parado (deploy $result) — a mudança segue pendente para o próximo push."
    continue
  fi

  ref="refs/deploy/$ENVIRONMENT/$target"
  echo "$target: marco avança para $(git rev-parse --short HEAD) ($reason)."
  # `--force`: rollback move o marco para trás de propósito, e recusar isso deixaria o ambiente
  # publicando um diff contra commit que não está mais no ar.
  git push --force origin "HEAD:$ref"
done
