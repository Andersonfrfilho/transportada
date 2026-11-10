#!/usr/bin/env bash
# SOMENTE LEITURA. Lista quem, em cada empresa, poderia confirmar no grupo do WhatsApp que um mesmo canhoto vale para
# duas notas: vínculo ativo + papel com `trip.report-on-behalf` (company-admin, operator, finance) + telefone de
# WhatsApp verificado. Telefone sai mascarado. Concessão direta e papel de grupo não entram (conferir à parte).
# Uso: [ENV_NAME=production|staging] bash producao-atendentes-confirmam-canhoto.sh
set -euo pipefail
ENV_NAME="${ENV_NAME:-production}"
REPO="${REPO:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"
OUT_DIR="${OUT_DIR:-${REPO:-.}/tmp/ops/saidas}"
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/producao-atendentes-confirmam-canhoto-$(date +%F-%H%M%S).json"
command -v railway >/dev/null || { echo "railway CLI ausente" >&2; exit 1; }
railway whoami >/dev/null || { echo "railway não está logado" >&2; exit 1; }

CODE=$(cat <<'TS'
import { SQL } from 'bun'
const sql = new SQL(process.env.DATABASE_URL!)
await sql`set transaction read only`.catch(() => {})
const rows = await sql`
  select m.company_id, f.legal_name as company, m.user_id, m.job_title,
         string_agg(distinct r.role, ',' order by r.role) as roles,
         p.phone, p.verified_at
  from user_company_memberships m
  join companies c on c.id = m.company_id
  left join company_fiscal_profiles f on f.company_id = m.company_id
  join identity_users u on u.id = m.user_id and u.status = 'active'
  join membership_roles r on r.membership_id = m.id
    and r.role in ('company-admin', 'operator', 'finance')
  left join user_whatsapp_phones p on p.user_id = m.user_id
  where m.status = 'active'
  group by m.company_id, f.legal_name, m.user_id, m.job_title, p.phone, p.verified_at
  order by f.legal_name, m.user_id`
const mask = (v: string | null) => (v ? `${v.slice(0, 5)}****${v.slice(-2)}` : null)
const out: unknown[] = []
for (const row of rows) {
  out.push({
    company: row.company, userId: row.user_id, jobTitle: row.job_title, roles: row.roles,
    phone: mask(row.phone), verified: row.verified_at !== null,
    canConfirm: row.phone !== null && row.verified_at !== null,
  })
}
console.log('__RESULT__' + JSON.stringify(out, null, 2).replaceAll('\n', '\\n'))
await sql.close()
TS
)
B64=$(printf '%s' "$CODE" | base64 -w0)
railway ssh -s api -e "$ENV_NAME" -- sh -c "echo $B64 | base64 -d > /tmp/atendentes.ts && bun run /tmp/atendentes.ts; rm -f /tmp/atendentes.ts" | grep '^__RESULT__' | sed 's/^__RESULT__//' | sed 's/\\n/\n/g' > "$OUT"
[ -s "$OUT" ] || { echo "saída vazia: confira railway ssh/consulta" >&2; exit 1; }
echo "$OUT"
