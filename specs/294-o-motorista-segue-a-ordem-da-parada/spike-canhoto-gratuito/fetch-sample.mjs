/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Protótipo do spike T4.8b (spec 294) — descartável, fora das apps. Ver ../spike-canhoto-gratuito.md.
 * Nunca imprime texto reconhecido nem número de nota; grava só contagens e acertos por índice opaco.
 */
const sql = new Bun.SQL(process.env.DATABASE_URL)
const e = process.env
const OFFSET = Number(e.SPIKE_OFFSET ?? 0),
  LIMIT = Number(e.SPIKE_LIMIT ?? 30)
let rows
await sql.begin('read only', async (tx) => {
  rows = await tx`
    with sel as (
      select p.id, p.canhoto_review review, s.bucket, s.object_key, e.trip_document_id, td.trip_id, td.stop_id
      from trip_delivery_proofs p join trip_stop_events e on e.id=p.stop_event_id
      join stored_objects s on s.id=p.object_id join trip_documents td on td.id=e.trip_document_id
      where p.kind='photo' and s.status='final' and p.canhoto_review in ('approved','rejected')
      order by (p.canhoto_review='rejected') desc, md5(p.id::text) limit 111)
    select sel.review, sel.bucket, sel.object_key,
      (select n.number from trip_documents t join nfe_documents n on n.id=t.nfe_document_id where t.id=sel.trip_document_id) truth,
      (select coalesce(json_agg(n.number),'[]') from trip_documents t join nfe_documents n on n.id=t.nfe_document_id where t.trip_id=sel.trip_id) trip_numbers,
      (select coalesce(json_agg(n.number),'[]') from trip_documents t join nfe_documents n on n.id=t.nfe_document_id where t.trip_id=sel.trip_id and t.stop_id is not distinct from sel.stop_id) stop_numbers
    from sel order by (sel.review='rejected') desc, md5(sel.id::text) offset ${OFFSET} limit ${LIMIT}`
})
await sql.close()
const client = new Bun.S3Client({
  endpoint: e.OBJECT_STORAGE_ENDPOINT ?? e.STORAGE_ENDPOINT,
  accessKeyId: e.OBJECT_STORAGE_ACCESS_KEY ?? e.STORAGE_ACCESS_KEY,
  secretAccessKey: e.OBJECT_STORAGE_SECRET_KEY ?? e.STORAGE_SECRET_KEY,
  region: e.OBJECT_STORAGE_REGION ?? e.STORAGE_REGION ?? 'us-east-1',
})
let i = OFFSET
for (const r of rows) {
  const bytes = await client.file(r.object_key, { bucket: r.bucket }).arrayBuffer()
  console.log(
    `__META__${i}|` +
      JSON.stringify({
        review: r.review,
        truth: r.truth,
        trip: r.trip_numbers,
        stop: r.stop_numbers,
      }),
  )
  console.log(`__FILE__${i}|` + Buffer.from(bytes).toString('base64'))
  i++
}
process.exit(0)
