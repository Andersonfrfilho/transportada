#!/usr/bin/env bash
# Copia a contratante UNICA (CNPJ 26344834000108) e algumas notas recentes dela da PRODUCAO para o STAGING,
# para testar o aviso de ocorrencia por WhatsApp (spec 318).
#   - Producao: SOMENTE LEITURA (transacao read only). Staging: escreve, mas so grava com --confirm.
#   - Sem --confirm e uma SIMULACAO: roda tudo dentro de uma transacao e desfaz no fim.
#   - Anonimiza: contatos da contratante (e-mail/telefone/nome), destinatarios das notas (nome, CPF, endereco,
#     telefone, e-mail) e o texto livre da nota. O emitente (a Unica, empresa) fica como e.
#   - O arquivo XML das notas NAO e copiado (o balde de producao nao e lido): as linhas existem, o download do XML nao.
# Uso: bash <este arquivo> [--confirm]      Opcoes por variavel: NOTES=5 (quantas notas) CNPJ=26344834000108
# Saida completa: tmp/ops/saidas/staging-copia-unica-<data>.txt  (o script imprime so o caminho)
set -euo pipefail
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$HOME/.bun/bin:$PATH"
if ! command -v railway >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi
command -v railway >/dev/null 2>&1 || { echo "railway nao encontrado no PATH" >&2; exit 1; }
railway whoami >/dev/null 2>&1 || { echo "railway deslogado: rode 'railway login'" >&2; exit 1; }
CONFIRM=0; [ "${1:-}" = "--confirm" ] && CONFIRM=1
CNPJ="${CNPJ:-26344834000108}"; NOTES="${NOTES:-5}"
case "$CNPJ$NOTES" in *[!0-9]*) echo "CNPJ e NOTES so aceitam numeros" >&2; exit 1;; esac
BASE="/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas"; mkdir -p "$BASE"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BASE/staging-copia-unica-$STAMP.txt"
EXPORT="$BASE/staging-copia-unica-$STAMP.export.json"
RAW="$(mktemp)"; trap 'rm -f "$RAW"; echo "$OUT"' EXIT
cd /home/miyazaki/Documents/personal/transportada

read -r -d '' EXPORT_JS <<'JSEOF' || true
const sql = new Bun.SQL(process.env.DATABASE_URL)
const CNPJ = process.env.CNPJ, NOTES = Number(process.env.NOTES || 5), CAP = 3000
const SKIP = new Set(['companies', 'identity_users', 'user_company_memberships', 'identity_user_profiles'])
const DOWN_OK = new Set(['nfe_participants', 'nfe_addresses', 'nfe_products', 'nfe_volumes', 'contractor_contacts'])
const tables = {}, seen = new Set(), queue = []
let total = 0
const q = (n) => '"' + n.replace(/"/g, '') + '"'
async function run() {
  await sql.begin(async (tx) => {
    await tx`set transaction read only`
    const fks = await tx`select c.conrelid::regclass::text as tbl, c.confrelid::regclass::text as ptbl,
      (select array_agg(a.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(attnum, ord)
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols,
      (select array_agg(a.attname::text order by k.ord) from unnest(c.confkey) with ordinality k(attnum, ord)
         join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) as pcols
      from pg_constraint c join pg_namespace n on n.oid = c.connamespace where c.contype = 'f' and n.nspname = 'public'`
    const pks = await tx`select c.conrelid::regclass::text as tbl,
      (select array_agg(a.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(attnum, ord)
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols
      from pg_constraint c join pg_namespace n on n.oid = c.connamespace where c.contype = 'p' and n.nspname = 'public'`
    const pkOf = Object.fromEntries(pks.map((r) => [r.tbl, r.cols]))
    const up = {}, down = {}
    for (const f of fks) { (up[f.tbl] ||= []).push(f); (down[f.ptbl] ||= []).push(f) }
    const add = (tbl, row) => {
      const key = tbl + '|' + JSON.stringify((pkOf[tbl] || Object.keys(row)).map((c) => row[c]))
      if (seen.has(key)) return
      seen.add(key)
      if (++total > CAP) throw new Error('fechamento passou de ' + CAP + ' linhas: reduza NOTES')
      ;(tables[tbl] ||= []).push(row)
      queue.push([tbl, row])
    }
    const fetchBy = async (tbl, cols, vals) => {
      const where = cols.map((c, i) => q(c) + ' = $' + (i + 1)).join(' and ')
      return (await tx.unsafe('select to_jsonb(t) as j from ' + q(tbl) + ' t where ' + where, vals)).map((r) => r.j)
    }
    for (const r of await tx`select to_jsonb(c) as j from contractors c where c.tax_id = ${CNPJ}`) add('contractors', r.j)
    if (!tables.contractors) throw new Error('contratante ' + CNPJ + ' nao existe em producao')
    for (const r of await tx`select to_jsonb(d) as j from nfe_documents d
        join nfe_participants p on p.document_id = d.id and p.company_id = d.company_id and p.role = 'emitter'
        where p.tax_id = ${CNPJ} order by d.issued_at desc limit ${NOTES}`) add('nfe_documents', r.j)
    while (queue.length) {
      const [tbl, row] = queue.shift()
      for (const f of up[tbl] || []) {
        if (SKIP.has(f.ptbl)) continue
        const vals = f.cols.map((c) => row[c])
        if (vals.some((v) => v === null || v === undefined)) continue
        for (const p of await fetchBy(f.ptbl, f.pcols, vals)) add(f.ptbl, p)
      }
      for (const f of down[tbl] || []) {
        if (!DOWN_OK.has(f.tbl) || SKIP.has(f.tbl)) continue
        for (const c of await fetchBy(f.tbl, f.cols, f.pcols.map((c) => row[c]))) add(f.tbl, c)
      }
    }
  })
}
function anonymize() {
  let n = 0
  for (const r of tables.contractor_contacts || []) { n++; r.email = 'unica-contato-' + n + '@example.invalid'; r.phone = null; r.name = 'Contato Teste ' + n }
  for (const r of tables.nfe_documents || []) { r.recipient_email = null; r.additional_information = null }
  const fake = new Set()
  let m = 0
  for (const r of tables.nfe_participants || []) {
    if (r.role === 'emitter') continue
    m++; fake.add(r.id)
    r.legal_name = 'Destinatario Teste ' + m; r.trade_name = null
    if (typeof r.tax_id === 'string' && r.tax_id.replace(/\D/g, '').length === 11) r.tax_id = '11144477735'
  }
  for (const r of tables.nfe_addresses || []) {
    if (!fake.has(r.participant_id)) continue
    for (const k of Object.keys(r)) {
      if (/phone|fone|email/i.test(k)) r[k] = null
      else if (/^(street|logradouro)$/i.test(k)) r[k] = 'Rua Teste'
      else if (/^(number|numero)$/i.test(k)) r[k] = '100'
      else if (/^(complement|complemento)$/i.test(k)) r[k] = null
    }
  }
}
try {
  await run()
  anonymize()
  const companyIds = [...new Set(Object.values(tables).flat().map((r) => r.company_id).filter(Boolean))]
  const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]))
  console.log('__RESULT__' + JSON.stringify({ meta: { companyIds, counts, cnpj: CNPJ }, tables }))
} catch (e) {
  console.log('__ERROR__' + String(e && e.message ? e.message : e))
}
await sql.close()
JSEOF

read -r -d '' IMPORT_JS <<'JSEOF' || true
const sql = new Bun.SQL(process.env.DATABASE_URL)
const CONFIRM = process.env.CONFIRM === '1'
const payload = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(await Bun.file('/tmp/unica.gz').arrayBuffer()))))
const { tables, meta } = payload
const q = (n) => '"' + n.replace(/"/g, '') + '"'
const report = { modo: CONFIRM ? 'GRAVOU' : 'SIMULACAO (nada gravado)', passos: [] }
class Rollback extends Error {}
try {
  await sql.begin(async (tx) => {
    const comps = (await tx`select id::text as id from companies`).map((r) => r.id)
    const companyMap = {}
    for (const pid of meta.companyIds) {
      if (comps.includes(pid)) companyMap[pid] = pid
      else if (comps.length === 1) companyMap[pid] = comps[0]
      else throw new Error('empresa ' + pid + ' nao existe em staging e ha ' + comps.length + ' empresas')
    }
    let user = (await tx`select user_id::text as id from identity_user_profiles where username = ${'anderson.fernandes'}`)[0]
    if (!user) user = (await tx`select id::text as id from identity_users order by created_at limit 1`)[0]
    if (!user) throw new Error('staging sem nenhum usuario')
    report.usuarioStaging = user.id
    const fks = await tx`select c.conrelid::regclass::text as tbl, c.confrelid::regclass::text as ptbl,
      (select array_agg(a.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(attnum, ord)
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols,
      (select array_agg(a.attname::text order by k.ord) from unnest(c.confkey) with ordinality k(attnum, ord)
         join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) as pcols
      from pg_constraint c join pg_namespace n on n.oid = c.connamespace where c.contype = 'f' and n.nspname = 'public'`
    const have = new Set((await tx`select table_name from information_schema.tables where table_schema = 'public'`).map((r) => r.table_name))
    for (const t of Object.keys(tables)) if (!have.has(t)) throw new Error('tabela ' + t + ' nao existe em staging')
    // contratante que ja existe em staging com outro id: usa a de staging
    const idMap = {}, skipRows = new Set()
    for (const r of tables.contractors || []) {
      const cid = companyMap[r.company_id] || r.company_id
      const ex = await tx`select id::text as id from contractors where company_id = ${cid}::uuid and tax_id = ${r.tax_id}`
      if (ex.length && ex[0].id !== r.id) { idMap[r.id] = ex[0].id; skipRows.add(r.id) }
    }
    report.contratanteJaEmStaging = Object.keys(idMap).length ? idMap : 'nao (sera criada)'
    const usersFk = {}, contrFk = {}
    for (const f of fks) {
      if (f.ptbl === 'identity_users') (usersFk[f.tbl] ||= []).push(...f.cols)
      if (f.ptbl === 'contractors') (contrFk[f.tbl] ||= []).push(f.cols[f.pcols.indexOf('id')])
    }
    for (const [t, rows] of Object.entries(tables)) for (const r of rows) {
      if ('company_id' in r && r.company_id) r.company_id = companyMap[r.company_id] || r.company_id
      for (const c of usersFk[t] || []) if (r[c]) r[c] = user.id
      for (const c of contrFk[t] || []) if (c && r[c] && idMap[r[c]]) r[c] = idMap[r[c]]
    }
    // ordem: pais antes dos filhos
    const names = Object.keys(tables), deps = {}
    for (const n of names) deps[n] = new Set()
    for (const f of fks) if (f.tbl !== f.ptbl && deps[f.tbl] && tables[f.ptbl]) deps[f.tbl].add(f.ptbl)
    const order = [], done = new Set()
    while (order.length < names.length) {
      const next = names.filter((n) => !done.has(n) && [...deps[n]].every((d) => done.has(d)))
      if (!next.length) { report.aviso = 'ciclo entre tabelas: ordem parcial'; for (const n of names) if (!done.has(n)) { order.push(n); done.add(n) } break }
      for (const n of next) { order.push(n); done.add(n) }
    }
    for (const t of order) {
      let rows = tables[t]
      if (t === 'contractors') rows = rows.filter((r) => !skipRows.has(r.id))
      if (!rows.length) { report.passos.push({ tabela: t, oferecidas: 0, inseridas: 0 }); continue }
      const res = await tx.unsafe('insert into ' + q(t) + ' select * from jsonb_populate_recordset(null::' + q(t) + ', $1::jsonb) on conflict do nothing returning 1', [JSON.stringify(rows)])
      report.passos.push({ tabela: t, oferecidas: rows.length, inseridas: res.length })
    }
    if (!CONFIRM) throw new Rollback('simulacao')
  })
} catch (e) {
  if (!(e instanceof Rollback)) report.erro = String(e && e.message ? e.message : e)
}
console.log('__RESULT__' + JSON.stringify(report, null, 1))
await sql.close()
JSEOF

{
echo "== staging-copia-unica ($STAMP) =="
echo "producao: SOMENTE LEITURA | staging: $([ $CONFIRM = 1 ] && echo GRAVA || echo SIMULACAO) | CNPJ=$CNPJ NOTES=$NOTES"
echo
echo "-- 1/2 exportando de PRODUCAO (read only) --"
} > "$OUT"
ENC_E=$(printf '%s' "$EXPORT_JS" | base64 -w0)
railway ssh -s api -e production -- sh -c "echo $ENC_E | base64 -d > /tmp/e.mjs && CNPJ=$CNPJ NOTES=$NOTES bun /tmp/e.mjs; rm -f /tmp/e.mjs" > "$RAW" 2>&1 || true
if grep -q '^__ERROR__' "$RAW"; then
  { echo "ERRO na exportacao:"; grep '^__ERROR__' "$RAW" | sed 's/^__ERROR__//'; } >> "$OUT"; exit 0
fi
sed -n 's/^__RESULT__//p' "$RAW" > "$EXPORT"
if [ ! -s "$EXPORT" ]; then { echo "exportacao sem resultado; saida crua:"; tail -n 40 "$RAW"; } >> "$OUT"; exit 0
fi
{ echo "exportado para $EXPORT"; echo "linhas por tabela:"; grep -o '"counts":{[^}]*}' "$EXPORT"; echo; echo "-- 2/2 importando em STAGING --"; } >> "$OUT"
GZ=$(gzip -9c "$EXPORT" | base64 -w0)
if [ "${#GZ}" -gt 90000 ]; then echo "payload grande demais (${#GZ} bytes): rode com NOTES=3" >> "$OUT"; exit 0; fi
ENC_I=$(printf '%s' "$IMPORT_JS" | base64 -w0)
railway ssh -s api -e staging -- sh -c "echo $GZ | base64 -d > /tmp/unica.gz && echo $ENC_I | base64 -d > /tmp/i.mjs && CONFIRM=$CONFIRM bun /tmp/i.mjs; rm -f /tmp/i.mjs /tmp/unica.gz" 2>&1 | sed -n '/__RESULT__/,$p' | sed 's/__RESULT__//' >> "$OUT" || true
