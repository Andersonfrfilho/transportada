/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0048 §6: lançar taxa é `trip.manage` — do escritório, **nunca do motorista**. Ele é quem vê a
 * taxa acontecer, e o caminho dele é a ocorrência (D4c), que vira sugestão para alguém conferir.
 */
import { z } from 'zod'

import { defineRoute } from '../../http/router.service.js'
import { parseBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import {
  API_DELIVERY_CHARGES_PATH,
  API_DELIVERY_CLIENTS_PATH,
  API_TRIPS_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import {
  DELIVERY_CHARGE_STATUSES,
  DELIVERY_CHARGE_TYPES,
} from '../../database/delivery-client.schema.js'
import type {
  DeliveryCharge,
  DeliveryChargeListFilters,
  DeliveryChargePage,
  DeliveryChargeRule,
} from '../application/delivery-charge.port.js'
import type {
  ConfirmChargeInput,
  RecordDeliveryChargeInput,
} from '../application/delivery-charges.use-case.js'

const TRIP_DOCUMENT_CHARGES_PATH = `${API_TRIPS_PATH}/:id/documents/:documentId/charges`
const CHARGE_CONFIRM_PATH = `${API_DELIVERY_CHARGES_PATH}/confirm`
const CHARGE_DISMISS_PATH = `${API_DELIVERY_CHARGES_PATH}/:id/dismiss`
const CLIENT_CHARGE_RULES_PATH = `${API_DELIVERY_CLIENTS_PATH}/:id/charge-rules`
const CLIENT_CHARGE_RULE_PATH = `${CLIENT_CHARGE_RULES_PATH}/:ruleId`

const CHARGE_MANAGE_POLICY = { permission: 'trip.manage', scope: 'company' } as const
const CHARGE_READ_POLICY = { permission: 'trip.read', scope: 'company' } as const

const AMOUNT_PATTERN = /^[0-9]{1,10}(\.[0-9]{1,4})?$/u
const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

const recordSchema = z
  .object({
    amount: z.string().regex(AMOUNT_PATTERN),
    /** Retroativa é o caso normal: o comprovante em papel volta com o motorista no fim do dia. */
    chargedOn: z.string().regex(DATE_PATTERN),
    chargeType: z.enum(DELIVERY_CHARGE_TYPES),
    notes: z.string().trim().max(500).default(''),
  })
  .strict()

const confirmSchema = z
  .object({
    charges: z
      .array(
        z
          .object({ amount: z.string().regex(AMOUNT_PATTERN).optional(), id: z.string().uuid() })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict()

const dismissSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict()

const ruleSchema = z
  .object({
    chargeType: z.enum(DELIVERY_CHARGE_TYPES),
    expectedAmount: z.string().regex(AMOUNT_PATTERN),
  })
  .strict()

export type DeliveryChargeRoutesDependencies = {
  readonly confirmCharges: {
    execute(input: {
      readonly charges: readonly ConfirmChargeInput[]
      readonly context: CompanyContext
    }): Promise<readonly DeliveryCharge[]>
  }
  readonly deactivateRule: {
    execute(input: {
      readonly context: CompanyContext
      readonly deliveryClientId: string
      readonly ruleId: string
    }): Promise<void>
  }
  readonly dismissCharge: {
    execute(input: {
      readonly context: CompanyContext
      readonly id: string
      readonly reason: string
    }): Promise<DeliveryCharge>
  }
  readonly listCharges: {
    execute(input: {
      readonly context: CompanyContext
      readonly filters: DeliveryChargeListFilters
    }): Promise<DeliveryChargePage>
  }
  readonly listRules: {
    execute(input: {
      readonly context: CompanyContext
      readonly deliveryClientId: string
    }): Promise<readonly DeliveryChargeRule[]>
  }
  readonly recordCharge: {
    execute(
      input: Omit<RecordDeliveryChargeInput, 'context'> & { readonly context: CompanyContext },
    ): Promise<DeliveryCharge>
  }
  readonly upsertRule: {
    execute(input: {
      readonly chargeType: DeliveryChargeRule['chargeType']
      readonly context: CompanyContext
      readonly deliveryClientId: string
      readonly expectedAmount: string
    }): Promise<DeliveryChargeRule>
  }
}

export function createDeliveryChargeRoutes(
  dependencies: DeliveryChargeRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{ readonly filters: DeliveryChargeListFilters }>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.listCharges.execute({
          context: context.scope,
          filters: input.filters,
        })

        return jsonResponse({
          body: { data: page.items, page: { nextCursor: page.nextCursor } },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }) => ({ filters: parseChargeList(new URL(request.url)) }),
      pathname: API_DELIVERY_CHARGES_PATH,
      policy: CHARGE_READ_POLICY,
    }),
    defineRoute<Omit<RecordDeliveryChargeInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const charge = await dependencies.recordCharge.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: charge }, status: 201 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        return {
          ...(await parseBody(recordSchema, request)),
          tripDocumentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
        }
      },
      pathname: TRIP_DOCUMENT_CHARGES_PATH,
      policy: CHARGE_MANAGE_POLICY,
    }),
    /**
     * A conferência é **em lote**: o trabalho real é "12 taxas sugeridas hoje", e confirmar uma a
     * uma é onde o operador desiste — e taxa não confirmada é prejuízo silencioso.
     */
    defineRoute<{ readonly charges: readonly ConfirmChargeInput[] }>({
      async handle({ context, input }): Promise<Response> {
        const confirmed = await dependencies.confirmCharges.execute({
          charges: input.charges,
          context: context.scope,
        })

        return jsonResponse({ body: { data: confirmed }, status: 200 })
      },
      method: 'POST',
      async parse({ request }) {
        const { charges } = await parseBody(confirmSchema, request)
        /** `exactOptionalPropertyTypes`: linha sem valor editado não manda `amount: undefined`. */
        return {
          charges: charges.map((charge) =>
            charge.amount === undefined
              ? { id: charge.id }
              : { amount: charge.amount, id: charge.id },
          ),
        }
      },
      pathname: CHARGE_CONFIRM_PATH,
      policy: CHARGE_MANAGE_POLICY,
    }),
    defineRoute<{ readonly id: string; readonly reason: string }>({
      async handle({ context, input }): Promise<Response> {
        const charge = await dependencies.dismissCharge.execute({
          context: context.scope,
          id: input.id,
          reason: input.reason,
        })

        return jsonResponse({ body: { data: charge }, status: 200 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        return {
          id: parseUuidPathIdentifier(pathParameters.id ?? ''),
          reason: (await parseBody(dismissSchema, request)).reason,
        }
      },
      pathname: CHARGE_DISMISS_PATH,
      policy: CHARGE_MANAGE_POLICY,
    }),
    defineRoute<{ readonly deliveryClientId: string }>({
      async handle({ context, input }): Promise<Response> {
        const rules = await dependencies.listRules.execute({
          context: context.scope,
          deliveryClientId: input.deliveryClientId,
        })

        return jsonResponse({ body: { data: rules }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        deliveryClientId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: CLIENT_CHARGE_RULES_PATH,
      policy: CHARGE_READ_POLICY,
    }),
    defineRoute<z.infer<typeof ruleSchema> & { readonly deliveryClientId: string }>({
      async handle({ context, input }): Promise<Response> {
        const rule = await dependencies.upsertRule.execute({
          chargeType: input.chargeType,
          context: context.scope,
          deliveryClientId: input.deliveryClientId,
          expectedAmount: input.expectedAmount,
        })

        return jsonResponse({ body: { data: rule }, status: 200 })
      },
      method: 'PUT',
      async parse({ pathParameters, request }) {
        return {
          ...(await parseBody(ruleSchema, request)),
          deliveryClientId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: CLIENT_CHARGE_RULES_PATH,
      policy: CHARGE_MANAGE_POLICY,
    }),
    defineRoute<{ readonly deliveryClientId: string; readonly ruleId: string }>({
      async handle({ context, input }): Promise<Response> {
        await dependencies.deactivateRule.execute({
          context: context.scope,
          deliveryClientId: input.deliveryClientId,
          ruleId: input.ruleId,
        })

        return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
      },
      method: 'DELETE',
      parse: ({ pathParameters }) => ({
        deliveryClientId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        ruleId: parseUuidPathIdentifier(pathParameters.ruleId ?? ''),
      }),
      pathname: CLIENT_CHARGE_RULE_PATH,
      policy: CHARGE_MANAGE_POLICY,
    }),
  ]
}

function parseChargeList(url: URL): DeliveryChargeListFilters {
  const parameters = url.searchParams
  const contractorId = parameters.get('contractorId')
  const cursor = parameters.get('cursor')
  const deliveryClientId = parameters.get('deliveryClientId')
  const from = parameters.get('from')
  const status = parameters.get('status')
  const to = parameters.get('to')

  return {
    ...(contractorId === null ? {} : { contractorId: z.string().uuid().parse(contractorId) }),
    ...(cursor === null ? {} : { cursor }),
    ...(deliveryClientId === null
      ? {}
      : { deliveryClientId: z.string().uuid().parse(deliveryClientId) }),
    ...(from === null ? {} : { from: z.string().regex(DATE_PATTERN).parse(from) }),
    limit:
      parameters.get('limit') === null
        ? DEFAULT_LIMIT
        : z.coerce.number().int().min(1).max(MAX_LIMIT).parse(parameters.get('limit')),
    ...(status === null ? {} : { status: z.enum(DELIVERY_CHARGE_STATUSES).parse(status) }),
    ...(to === null ? {} : { to: z.string().regex(DATE_PATTERN).parse(to) }),
  }
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}
