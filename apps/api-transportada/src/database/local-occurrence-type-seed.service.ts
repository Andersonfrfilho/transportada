/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Semente dos **tipos de ocorrência** da bancada local. Sem nenhum tipo de separação ativo a tela da
 * viagem não desenha o botão "Ocorrência de separação" — a regra é essa desde a spec 161 —, e a
 * bancada montada por `make bench` nascia sem eles: dava para separar e carregar, nunca para
 * registrar o que deu errado.
 *
 * ⚠️ Escreve pelo mesmo caminho da API (`saveOccurrenceType`), nunca por `INSERT` bruto
 * (code-standart §5). Idempotente: rodar de novo não duplica, porque o nome é a identidade aqui.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { parseEnvironment } from '../config/environment.schema.js'
import { companies } from './identity.schema.js'
import { companyOccurrenceTypes } from './trip.schema.js'
import type { RedeliveryPolicy } from './trip.schema.js'
import { saveOccurrenceType } from '../trips/infrastructure/delivery-proof-read.support.js'
import type { TripOccurrenceStage } from '../shared/trip-occurrence.constant.js'

/**
 * Os mesmos três de staging, para a bancada exercitar o caso real (spec 166: multi-item).
 *
 * `redeliveryPolicy` decide se o registro abre tratativa (spec 164 T4). Escolhida por tipo, não
 * uniforme: "Item avariado" e "Item faltante" são falha da separação — o item nem devia ter saído
 * assim, então reentrega **não** é a resposta automática (`blocked`, quem decide é o operador na
 * tratativa manual, fora deste fluxo). "Divergência de quantidade" é o inverso: falta um item que
 * a rota já vai cobrir de novo, então **permite** reentrega. Do lado da entrega, "Destinatário
 * ausente" é o caso clássico de reentrega — ninguém recebeu, a nota inteira volta (`allowed`).
 * "Recusa parcial" quem recusou foi o próprio destinatário; reentregar sem contato prévio repete a
 * recusa, então fica bloqueada (`blocked`) até a tratativa manual decidir.
 */
const LOCAL_OCCURRENCE_TYPES = [
  { name: 'Item avariado', redeliveryPolicy: 'blocked', stage: 'separation' },
  { name: 'Divergência de quantidade', redeliveryPolicy: 'allowed', stage: 'separation' },
  { name: 'Item faltante', redeliveryPolicy: 'blocked', stage: 'separation' },
  { name: 'Destinatário ausente', redeliveryPolicy: 'allowed', stage: 'delivery' },
  { name: 'Recusa parcial', redeliveryPolicy: 'blocked', stage: 'delivery' },
] as const satisfies readonly {
  name: string
  redeliveryPolicy: RedeliveryPolicy
  stage: TripOccurrenceStage
}[]

async function seedOccurrenceTypes(): Promise<void> {
  const config = parseEnvironment(process.env)
  const { db } = createDrizzleProvider({ connection: config.databaseUrl })
  const empresas = await db.select({ id: companies.id }).from(companies)
  if (empresas.length === 0) throw new Error('LOCAL_OCCURRENCE_TYPE_SEED_WITHOUT_COMPANY')

  let criados = 0
  let atualizados = 0
  for (const empresa of empresas) {
    for (const tipo of LOCAL_OCCURRENCE_TYPES) {
      const [existente] = await db
        .select({ id: companyOccurrenceTypes.id })
        .from(companyOccurrenceTypes)
        .where(
          and(
            eq(companyOccurrenceTypes.companyId, empresa.id),
            eq(companyOccurrenceTypes.name, tipo.name),
          ),
        )
        .limit(1)

      await saveOccurrenceType(db, {
        active: true,
        /** Spec 166: a bancada nasce como a instalação nasce — todo tipo aceita vários itens. */
        allowsMultipleItems: true,
        companyId: empresa.id,
        emailBody: '',
        emailSubject: '',
        emailTemplateKey: null,
        name: tipo.name,
        notifies: false,
        occurrenceTypeId: existente?.id ?? null,
        redeliveryPolicy: tipo.redeliveryPolicy,
        stage: tipo.stage,
      })

      if (existente === undefined) criados += 1
      else atualizados += 1
    }
  }

  console.log(`occurrence type seed: ${criados} created, ${atualizados} reconciled`)
}

await seedOccurrenceTypes()
process.exit(0)
