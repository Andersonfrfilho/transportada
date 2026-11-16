#!/usr/bin/env bash
# Contas (spec 325/331): preenche o TIPO (cartao) das contas da categoria "Cartao de credito" a partir do texto livre
# `bill_location` ("fatura do santander", "Fatura Santander", "mercado pago"...). Cria o tipo se nao existir (idempotente)
# e so mexe em conta que ainda esta SEM tipo. Quem nao casa com nenhum cartao conhecido e listado e nao e alterado.
# Sem --confirm: simulacao completa dentro de uma transacao que e DESFEITA. Com --confirm: grava, numa transacao.
# Uso: bash <este arquivo> staging|production [--confirm]
# Saida completa: tmp/ops/saidas/contas-cartao-tipo-<ambiente>-<modo>-<data>.json (o caminho e impresso no fim).
set -euo pipefail
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$HOME/.bun/bin:$PATH"
if ! command -v railway >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi
command -v railway >/dev/null 2>&1 || { echo "railway nao encontrado no PATH" >&2; exit 1; }
railway whoami >/dev/null 2>&1 || { echo "railway deslogado: rode 'railway login'" >&2; exit 1; }
ENV="${1:-}"; case "$ENV" in staging|production) shift;; *) echo "Uso: $0 staging|production [--confirm]" >&2; exit 1;; esac
CONFIRM=0
for a in "$@"; do case "$a" in --confirm) CONFIRM=1;; *) echo "argumento desconhecido: $a" >&2; exit 1;; esac; done
BASE="${OPS_SAIDAS:-/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas}"; mkdir -p "$BASE"
MODO=simulacao; [ "$CONFIRM" = 1 ] && MODO=gravacao
OUT="$BASE/contas-cartao-tipo-$ENV-$MODO-$(date -u +%Y%m%dT%H%M%SZ).json"
trap 'echo "$OUT"' EXIT
JS=$(cat <<'JSEOF'
const sql = new Bun.SQL(process.env.DATABASE_URL)
const CONFIRM = process.env.CONFIRM === "1"
const CARD = "Cartão de crédito"
const norm = (s) => (s ?? "").replace(/[-_]+/g, " ").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
// [trecho do texto, nome antigo do tipo, nome com a bandeira (nome do tipo = o que aparece no filtro e na lista)]
const CARDS = [
  ["santander", "Santander", "Santander Unique · Visa final 8738"],
  ["mercado pago", "Mercado Pago", "Mercado Pago · Visa final 1594"],
  ["mercadopago", "Mercado Pago", "Mercado Pago · Visa final 1594"],
  ["caixa", "Caixa", "Caixa"],
]
const cardOf = (loc) => CARDS.find(([k]) => norm(loc).includes(k)) ?? null
// Contas sem texto de local: o cartao vem da conferencia com as faturas de 11/2026 (nome + valor previsto).
// MP = Mercado Pago (compras listadas na fatura dele); o resto bateu com a fatura do Santander Unique.
const MP = "mercado pago", SAN = "santander"
const BY_VALUE = {
  "gigantao bateria|38.00": MP, "havan - utensilhos|88.27": MP, "vinicius trouvo - cirurgia|570.77": MP,
  "auto mart|700.00": SAN, "auto mart|450.00": SAN, "auto mart|1214.00": SAN,
  "liquida max|644.70": SAN, "liquida max moveis|235.00": SAN,
  "mra auto pecas|311.47": SAN, "mra auto pecas|128.68": SAN, "mra auto pecas|119.67": SAN,
  "opcao moveis|115.41": SAN, "revise car|109.37": SAN, "saldao liquida max|198.33": SAN,
}
const BY_VALUE_N = Object.fromEntries(Object.entries(BY_VALUE).map(([k, v]) => [norm(k.split("|")[0]).replace(/\s+/g, " ").trim() + "|" + k.split("|")[1], v]))
class Rollback extends Error {}
const out = { modo: CONFIRM ? "GRAVOU" : "SIMULACAO (desfeita no fim)" }
try {
  await sql.begin(async (tx) => {
    const [co] = await tx`select id::text as id from companies`
    const [cat] = await tx`select id::text as id from company_expense_categories where company_id = ${co.id}::uuid and name = ${CARD}`
    if (!cat) throw new Error("categoria " + CARD + " nao existe")
    const rows = await tx`select id::text as id, name, bill_location, subtype_id::text as subtype_id, expected_amount::text as valor
      from company_expenses where company_id = ${co.id}::uuid and category_id = ${cat.id}::uuid order by name`
    out.contasNaCategoria = rows.length
    out.locaisDistintos = [...new Set(rows.map((r) => r.bill_location ?? "(vazio)"))]
    const subs = Object.fromEntries((await tx`select lower(name) as n, id::text as id from company_expense_subtypes where company_id = ${co.id}::uuid and category_id = ${cat.id}::uuid`).map((r) => [r.n, r.id]))
    out.tiposQueJaExistiam = Object.keys(subs)
    out.criados = []; out.renomeados = []; out.atualizadas = []; out.jaTinhamTipo = 0; out.semCasamento = []
    // bandeira: o tipo que ja existia com o nome antigo ganha o nome com a bandeira (as contas dele continuam ligadas)
    for (const [, old, full] of CARDS) {
      if (old !== full && subs[old.toLowerCase()] && !subs[full.toLowerCase()]) {
        await tx`update company_expense_subtypes set name = ${full} where id = ${subs[old.toLowerCase()]}::uuid`
        subs[full.toLowerCase()] = subs[old.toLowerCase()]; delete subs[old.toLowerCase()]; out.renomeados.push(old + " -> " + full)
      }
    }
    for (const r of rows) {
      if (r.subtype_id) { out.jaTinhamTipo++; continue }
      const byValue = BY_VALUE_N[norm(r.name).replace(/\s+/g, " ").trim() + "|" + r.valor]
      const hit = cardOf(r.bill_location) ?? cardOf(r.name) ?? (byValue ? cardOf(byValue) : null)
      const card = hit?.[2]
      if (!card) { out.semCasamento.push({ conta: r.name, local: r.bill_location, valor: r.valor }); continue }
      let sid = subs[card.toLowerCase()]
      if (!sid) {
        const [c] = await tx`insert into company_expense_subtypes (company_id, category_id, name) values (${co.id}::uuid, ${cat.id}::uuid, ${card}) returning id::text as id`
        sid = c.id; subs[card.toLowerCase()] = sid; out.criados.push(card)
      }
      await tx`update company_expenses set subtype_id = ${sid}::uuid, updated_at = now() where id = ${r.id}::uuid and subtype_id is null`
      out.atualizadas.push({ conta: r.name, local: r.bill_location, tipo: card })
    }
    out.totalPorTipo = await tx`select s.name as tipo, count(*)::int as contas, sum(e.expected_amount)::text as previsto
      from company_expenses e join company_expense_subtypes s on s.id = e.subtype_id where e.company_id = ${co.id}::uuid group by s.name order by s.name`
    if (!CONFIRM) throw new Rollback("simulacao")
  })
  out.resultado = CONFIRM ? "GRAVADO" : "simulacao ok (desfeita)"
} catch (e) {
  out.resultado = e instanceof Rollback ? "simulacao ok (desfeita)" : "ERRO: " + (e?.message ?? String(e))
}
console.log("__RESULT__" + JSON.stringify(out, null, 1))
await sql.close()
process.exit(0)
JSEOF
)
ENC=$(printf '%s' "$JS" | base64 -w0)
RAW="$OUT.raw"
SVC=api
railway ssh -s "$SVC" -e "$ENV" -- sh -c "echo $ENC | base64 -d > /tmp/cc.mjs && CONFIRM=$CONFIRM bun /tmp/cc.mjs; rm -f /tmp/cc.mjs" > "$RAW" 2>&1 || true
sed -n '/__RESULT__/,$p' "$RAW" | sed 's/__RESULT__//' > "$OUT" || true
if [ ! -s "$OUT" ]; then { echo "sem resultado. Saida bruta do railway ssh (sem segredos):"; tail -40 "$RAW"; } > "$OUT"; fi
rm -f "$RAW"
