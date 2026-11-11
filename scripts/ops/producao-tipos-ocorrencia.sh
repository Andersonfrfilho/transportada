#!/usr/bin/env bash
# SOMENTE LEITURA em PRODUÇÃO: lista os tipos de ocorrência (nome, etapa, ativo e os modos que a promoção #678 passou a
# usar: foto, observação, localização, hora da chegada, valor pago, coleta de canhoto) e quantas ocorrências cada um tem.
# Serve para decidir, antes de rodar qualquer configuração de tipos em produção, o que já existe lá. Grava em
# tmp/ops/saidas/ e imprime só o caminho.
# Uso: bash <repositório>/scripts/ops/producao-tipos-ocorrencia.sh   (railway CLI logado)
set -euo pipefail
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$HOME/.bun/bin:$PATH"
if ! command -v railway >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi
command -v railway >/dev/null || { echo "railway CLI não encontrado" >&2; exit 1; }
REPO="${REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && git rev-parse --show-toplevel)}"
cd "$REPO"
OUT_DIR="/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas"; mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/producao-tipos-ocorrencia-$(date +%Y%m%d-%H%M%S).txt"
SCRIPT=$(cat <<'JS'
const sql = new Bun.SQL(process.env.DATABASE_URL)
await sql`set transaction read only`.catch(() => {})
const out = {}
out.tipos = await sql`select name, stage, flow, active, attachment_mode, note_mode, location_mode, arrival_time_mode,
  declared_amount_mode, creates_canhoto_pickup, notifies, emails_contractor from company_occurrence_types order by stage, name`.catch((e) => String(e.message))
out.ocorrenciasPorTipo = await sql`select t.name, count(o.*)::int as n from company_occurrence_types t left join trip_document_occurrences o on o.occurrence_type_id = t.id group by t.name order by n desc`.catch((e) => String(e.message))
console.log('__RESULT__' + JSON.stringify(out, null, 2))
await sql.close()
process.exit(0)
JS
)
ENCODED=$(printf '%s' "$SCRIPT" | base64 -w0)
railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -s api -e production -- sh -c "echo $ENCODED | base64 -d > /tmp/x.mjs && bun /tmp/x.mjs; rm -f /tmp/x.mjs" 2>&1 | sed -n '/__RESULT__/,$p' | sed 's/^__RESULT__//' > "$OUT"
[ -s "$OUT" ] || { echo "sem resultado" >&2; exit 1; }
echo "$OUT"
