#!/usr/bin/env bash
# Libera um domínio de e-mail para enviar XML de NF-e (spec 311, tabela nfe_xml_allowed_email_domains).
# Quem escreve de um endereço desse domínio, com DKIM alinhado, passa a ser aceito sem ser contato cadastrado.
# Sem --apply roda numa transação e desfaz (simulação). Reativa se o domínio já existir como inactive.
# Uso: bash liberar-dominio-xml.sh <staging|production> <dominio> [--apply]
set -euo pipefail
PROJECT_ID="62de4c69-216a-4335-93a0-4942c6a95c54"
OUT_DIR="/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas"
ENVIRONMENT="${1:-}"; DOMAIN="${2:-}"; APPLY="${3:-}"
case "$ENVIRONMENT" in staging | production) ;; *) echo "uso: $0 <staging|production> <dominio> [--apply]" >&2; exit 1 ;; esac
DOMAIN="$(printf '%s' "$DOMAIN" | tr 'A-Z' 'a-z' | sed 's/^@//')"
printf '%s' "$DOMAIN" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' || { echo "domínio inválido: $DOMAIN" >&2; exit 1; }
if [ "$APPLY" = "--apply" ]; then
  read -r -p "Liberar $DOMAIN para XML em $ENVIRONMENT? Digite sim: " ANSWER
  [ "$ANSWER" = "sim" ] || { echo "cancelado" >&2; exit 1; }
fi
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/liberar-dominio-xml-$ENVIRONMENT-$(date +%Y%m%d-%H%M%S).txt"
read -r -d '' JS <<'JS' || true
const sql = new Bun.SQL(process.env.DATABASE_URL)
const apply = process.env.APPLY === '--apply'
const domain = process.env.DOMAIN
const out = { modo: apply ? 'GRAVAR' : 'SIMULACAO', dominio: domain }
const finish = async (code = 0) => { console.log('__RESULT__' + JSON.stringify(out)); await sql.close(); process.exit(code) }
class Rollback extends Error {}
try {
  const companies = await sql`select id from companies where status = 'active'`
  if (companies.length !== 1) { out.erro = 'precisa de exatamente uma empresa ativa'; await finish(1) }
  const companyId = companies[0].id
  out.antes = await sql`select domain, status, created_at from nfe_xml_allowed_email_domains where company_id = ${companyId} order by domain`
  try {
    await sql.begin(async (tx) => {
      await tx`insert into nfe_xml_allowed_email_domains (company_id, domain, status) values (${companyId}, ${domain}, 'active') on conflict (company_id, domain) do update set status = 'active'`
      out.depois = await tx`select domain, status, created_at from nfe_xml_allowed_email_domains where company_id = ${companyId} order by domain`
      if (!apply) throw new Rollback('simulacao')
    })
    out.gravado = true
  } catch (e) {
    if (e instanceof Rollback) out.desfeito = 'simulação concluída sem gravar'
    else { out.erro = String(e?.message ?? e); await finish(1) }
  }
  await finish()
} catch (e) { out.erro = String(e?.message ?? e); await finish(1) }
JS
ENCODED="$(printf '%s' "$JS" | base64 -w0)"
RAW="$(railway ssh -p "$PROJECT_ID" -s api -e "$ENVIRONMENT" -- sh -c \
  "echo $ENCODED | base64 -d > /tmp/dom.mjs && DOMAIN='$DOMAIN' APPLY='$APPLY' bun /tmp/dom.mjs; rm -f /tmp/dom.mjs" 2>&1)" || { printf '%s\n' "$RAW" >"$OUT"; echo "$OUT"; exit 1; }
printf '%s\n' "$RAW" | grep '^__RESULT__' | sed 's/^__RESULT__//' >"$OUT" || printf '%s\n' "$RAW" >"$OUT"
echo "$OUT"
