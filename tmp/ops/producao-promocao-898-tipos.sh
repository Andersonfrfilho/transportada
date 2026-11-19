#!/usr/bin/env bash
# PRODUÇÃO: ativa "Espera longa" e cria "Local fechado" e "Endereço incorreto" com a MESMA configuração da staging
# (despejada em 18/11/2026: ícone, foto, observação, localização, chegada, espera mínima de 30 min, modelo de e-mail/WhatsApp).
# Sem --confirm é simulação: roda tudo numa transação e desfaz (nada é gravado). Com --confirm grava.
# Só cria tipo que não existe e só ajusta a "Espera longa" que já existe; nunca apaga nem renomeia nada.
# Aprovado pelo Anderson em 19/11/2026. Grava a saída em tmp/ops/saidas/ e imprime só o caminho.
set -euo pipefail
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$HOME/.bun/bin:$PATH"
if ! command -v railway >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi
command -v railway >/dev/null || { echo "railway CLI não encontrado" >&2; exit 1; }
railway whoami >/dev/null || { echo "railway não está logado" >&2; exit 1; }
CONFIRM="false"; [ "${1:-}" = "--confirm" ] && CONFIRM="true"
OUT_DIR="/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas"; mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/producao-promocao-898-tipos-$([ "$CONFIRM" = true ] && echo confirmado || echo simulacao)-$(date +%Y%m%d-%H%M%S).txt"
exec 3>&1
trap 'echo "$OUT" >&3' EXIT
SCRIPT=$(cat <<'JS'
const confirm = process.env.CONFIRM === 'true'
const sql = new Bun.SQL(process.env.DATABASE_URL)
const out = { confirm, passos: [] }
const COMMON = {
  notifies: true, active: true, emails_contractor: false, redelivery_policy: 'unset', allows_multiple_items: true,
  leaves_document_behind: false, items_mode: 'off', signature_mode: 'off', photo_minimum_count: 1,
  reference_number_mode: 'off', declared_amount_mode: 'off', contractor_reply_mode: 'off',
  contractor_scope: 'all', duplicate_request_policy: 'allow', client_email_type: 'off', client_email_send_mode: 'manual',
  client_channel: 'email', asks_client_contact: false, asks_new_due_date: false, show_client_charge_seal_to_driver: true,
  blocks_contractor_notice: false, counts_cargo_on_pickup_trip: true, creates_canhoto_pickup: false,
}
const TIPOS = {
  'Espera longa': { ...COMMON, flow: 'stop', stop_kind: 'long_wait', attachment_mode: 'required', note_mode: 'required', icon_name: 'clock',
    location_mode: 'required', arrival_time_mode: 'off', min_wait_after_arrival_minutes: 30, contractor_notification_template_key: 'ocorrencia.espera-longa' },
  'Local fechado': { ...COMMON, flow: 'document', stop_kind: null, attachment_mode: 'required', note_mode: 'optional', icon_name: 'alert',
    location_mode: 'required', arrival_time_mode: 'required', min_wait_after_arrival_minutes: null, contractor_notification_template_key: 'ocorrencia.local-fechado' },
  'Endereço incorreto': { ...COMMON, flow: 'document', stop_kind: null, attachment_mode: 'optional', note_mode: 'required', icon_name: 'clipboard-list',
    location_mode: 'required', arrival_time_mode: 'required', min_wait_after_arrival_minutes: null, contractor_notification_template_key: 'ocorrencia.endereco-incorreto' },
}
try {
  await sql.begin(async (tx) => {
    const base = await tx`select company_id from company_occurrence_types where lower(btrim(name)) = 'espera longa'`
    if (base.length !== 1) throw new Error(`esperava 1 tipo "Espera longa", achei ${base.length}`)
    const companyId = base[0].company_id
    for (const [name, cfg] of Object.entries(TIPOS)) {
      const rows = await tx`select * from company_occurrence_types where company_id = ${companyId} and lower(btrim(name)) = ${name.toLowerCase()}`
      const data = { ...cfg, contractor_notification_template_selected_at: new Date() }
      if (rows.length === 0) {
        out.passos.push({ tipo: name, acao: 'CRIA', config: cfg })
        await tx`insert into company_occurrence_types ${tx({ company_id: companyId, name, stage: 'delivery', ...data })}`
      } else if (name === 'Espera longa') {
        const antes = rows[0]
        const muda = Object.fromEntries(Object.entries(cfg).filter(([k, v]) => String(antes[k] ?? null) !== String(v ?? null)).map(([k, v]) => [k, { antes: antes[k] ?? null, depois: v }]))
        out.passos.push({ tipo: name, acao: 'AJUSTA (ativa e alinha à staging)', muda })
        await tx`update company_occurrence_types set ${tx({ ...data, updated_at: new Date() })} where id = ${antes.id}`
      } else {
        out.passos.push({ tipo: name, acao: 'JÁ EXISTE, não toquei', id: rows[0].id })
      }
    }
    if (!confirm) throw new Error('DRY_RUN')
  })
  out.resultado = 'GRAVADO'
} catch (e) {
  out.resultado = String(e.message) === 'DRY_RUN' ? 'simulação: nada foi gravado. repita com --confirm.' : 'ERRO: ' + e.message
}
console.log('__RESULT__' + JSON.stringify(out, null, 2))
await sql.close()
process.exit(0)
JS
)
ENCODED=$(printf '%s' "$SCRIPT" | base64 -w0)
railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -s api -e production -- sh -c "echo $ENCODED | base64 -d > /tmp/x.mjs && CONFIRM=$CONFIRM bun /tmp/x.mjs; rm -f /tmp/x.mjs" 2>&1 | sed -n '/__RESULT__/,$p' | sed 's/^__RESULT__//' > "$OUT"
[ -s "$OUT" ] || { echo "sem resultado" >&2; exit 1; }
