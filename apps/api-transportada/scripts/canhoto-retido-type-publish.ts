/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { companies } from '../src/database/database.schema.js'
import { companyOccurrenceTypes } from '../src/database/trip.schema.js'
import { saveOccurrenceType } from '../src/trips/infrastructure/delivery-proof-read.support.js'

/**
 * Spec 321 T7 (D1): cadastra o tipo "Canhoto retido pelo cliente" na empresa. Sem `--confirm` só imprime o plano
 * (dry-run). `--confirm` só cria; tipo que já existe nunca é reescrito (o script apenas diz se as marcas divergem).
 * Em staging/produção é mudança de dados: produção pede aprovação humana. Imprime só nome, id e veredito.
 *
 *   bun run scripts/canhoto-retido-type-publish.ts --company <uuid>
 *   bun run scripts/canhoto-retido-type-publish.ts --company <uuid> --confirm
 *   bun run scripts/canhoto-retido-type-publish.ts --list-companies
 */
const TYPE_NAME = 'Canhoto retido pelo cliente'

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? ''
  if (databaseUrl.length === 0) throw new Error('DATABASE_URL ausente')
  const provider = createDrizzleProvider({ connection: databaseUrl })
  try {
    if (process.argv.includes('--list-companies')) {
      const rows = await provider.db.select({ id: companies.id }).from(companies)
      process.stdout.write(rows.map((row) => `${row.id}\n`).join(''))
      return
    }
    const flag = process.argv.indexOf('--company')
    const companyId = flag < 0 ? '' : (process.argv[flag + 1] ?? '')
    if (!/^[0-9a-f-]{36}$/i.test(companyId)) throw new Error('--company <uuid> é obrigatório')
    const confirm = process.argv.includes('--confirm')

    const [company] = await provider.db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)
    if (company === undefined) throw new Error('empresa não encontrada')

    const [existing] = await provider.db
      .select({
        blocksContractorNotice: companyOccurrenceTypes.blocksContractorNotice,
        countsCargoOnPickupTrip: companyOccurrenceTypes.countsCargoOnPickupTrip,
        createsCanhotoPickup: companyOccurrenceTypes.createsCanhotoPickup,
        id: companyOccurrenceTypes.id,
      })
      .from(companyOccurrenceTypes)
      .where(
        and(
          eq(companyOccurrenceTypes.companyId, companyId),
          eq(companyOccurrenceTypes.name, TYPE_NAME),
        ),
      )
      .limit(1)

    if (existing !== undefined) {
      const marksOk =
        existing.blocksContractorNotice &&
        existing.createsCanhotoPickup &&
        !existing.countsCargoOnPickupTrip
      process.stdout.write(
        `${TYPE_NAME}  já existe (${existing.id})  marcas ${marksOk ? 'corretas' : 'DIVERGEM — ajuste na aba Tipos'}\n`,
      )
      return
    }
    if (!confirm) {
      process.stdout.write(`${TYPE_NAME}  seria criado\nnada foi gravado. repita com --confirm.\n`)
      return
    }
    const saved = await saveOccurrenceType(provider.db, {
      active: true,
      allowsMultipleItems: false,
      attachmentMode: 'optional',
      blocksContractorNotice: true,
      companyId,
      countsCargoOnPickupTrip: false,
      createsCanhotoPickup: true,
      duplicateRequestPolicy: 'until_resolved',
      emailTemplateKey: null,
      itemsMode: 'off',
      locationMode: 'off',
      moments: ['document', 'office'],
      name: TYPE_NAME,
      notifies: false,
      noteMode: 'required',
      occurrenceTypeId: null,
      signatureMode: 'off',
      stage: 'delivery',
    })
    process.stdout.write(`${TYPE_NAME}  criado (${saved.id})\n`)
  } finally {
    await provider.close()
  }
}

await main()
