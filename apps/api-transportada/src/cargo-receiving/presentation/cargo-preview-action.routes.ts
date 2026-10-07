/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a item 9 e RF5b: confirmar, desvincular e vincular o item, e propor a chegada —
 * `trip.manage`, idempotentes, corpo estrito. Propor não cria nada: devolve o rascunho.
 */
import { defineRoute, type RouterPathParameters } from '../../http/router.service.js'
import {
  parseBody,
  parseOptionalBody,
  parseUuidPathIdentifier,
} from '../../http/request-parsing.service.js'
import {
  API_CARGO_PREVIEW_ITEM_CONFIRM_PATH,
  API_CARGO_PREVIEW_ITEM_LINK_PATH,
  API_CARGO_PREVIEW_ITEM_UNLINK_PATH,
  API_CARGO_PREVIEW_PROPOSE_ARRIVAL_PATH,
} from '../../shared/api.constant.js'
import type { CargoPreviewItemActionOutcome } from '../application/cargo-preview-action.use-case.js'
import type {
  CargoPreviewItemActionParams,
  ProposeCargoPreviewArrivalParams,
} from '../application/cargo-preview-request.types.js'
import type { CargoPreviewArrivalProposal } from '../application/cargo-preview.types.js'
import {
  CARGO_PREVIEW_ITEM_ACTION,
  type CargoPreviewItemAction,
} from '../domain/cargo-preview-item-action.policy.js'
import { CARGO_ARRIVAL_MANAGE_POLICY, jsonResponse } from './cargo-arrival-http.support.js'
import { emptyBodySchema } from './cargo-arrival.schema.js'
import { linkCargoPreviewItemSchema } from './cargo-preview.schema.js'

type UseCase<TParams, TResult> = { execute(params: TParams): Promise<TResult> }
type ActionInput = Omit<CargoPreviewItemActionParams, 'context'>

export type CargoPreviewActionRoutesDependencies = {
  readonly itemAction: UseCase<CargoPreviewItemActionParams, CargoPreviewItemActionOutcome>
  readonly proposeArrival: UseCase<ProposeCargoPreviewArrivalParams, CargoPreviewArrivalProposal>
}

type Dependencies = CargoPreviewActionRoutesDependencies

const ITEM_ACTION_PATHS: readonly (readonly [CargoPreviewItemAction, string])[] = [
  [CARGO_PREVIEW_ITEM_ACTION.confirm, API_CARGO_PREVIEW_ITEM_CONFIRM_PATH],
  [CARGO_PREVIEW_ITEM_ACTION.unlink, API_CARGO_PREVIEW_ITEM_UNLINK_PATH],
  [CARGO_PREVIEW_ITEM_ACTION.link, API_CARGO_PREVIEW_ITEM_LINK_PATH],
]

export function createCargoPreviewActionRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    ...ITEM_ACTION_PATHS.map(([action, pathname]) =>
      itemActionRoute({ action, dependencies, pathname }),
    ),
    proposeArrivalRoute(dependencies),
  ]
}

function itemTarget(pathParameters: RouterPathParameters): {
  readonly itemId: string
  readonly previewId: string
} {
  return {
    itemId: parseUuidPathIdentifier(pathParameters.itemId ?? ''),
    previewId: parseUuidPathIdentifier(pathParameters.id ?? ''),
  }
}

async function readActionBody(
  action: CargoPreviewItemAction,
  request: Request,
): Promise<{ readonly documentId?: string }> {
  if (action === CARGO_PREVIEW_ITEM_ACTION.link) {
    return parseBody(linkCargoPreviewItemSchema, request)
  }
  await parseOptionalBody(emptyBodySchema, request)
  return {}
}

function itemActionRoute(input: {
  readonly action: CargoPreviewItemAction
  readonly dependencies: Dependencies
  readonly pathname: string
}): ReturnType<typeof defineRoute> {
  return defineRoute<ActionInput>({
    async handle({ context, input: params }): Promise<Response> {
      const outcome = await input.dependencies.itemAction.execute({
        context: context.scope,
        ...params,
      })
      return jsonResponse({ body: { data: outcome }, status: 200 })
    },
    method: 'POST',
    parse: async ({ correlationId, pathParameters, request }) => ({
      action: input.action,
      correlationId,
      ...itemTarget(pathParameters),
      ...(await readActionBody(input.action, request)),
    }),
    pathname: input.pathname,
    policy: CARGO_ARRIVAL_MANAGE_POLICY,
  })
}

function proposeArrivalRoute(dependencies: Dependencies): ReturnType<typeof defineRoute> {
  return defineRoute<Omit<ProposeCargoPreviewArrivalParams, 'context'>>({
    async handle({ context, input }): Promise<Response> {
      const proposal = await dependencies.proposeArrival.execute({
        context: context.scope,
        ...input,
      })
      return jsonResponse({ body: { data: proposal }, status: 200 })
    },
    method: 'POST',
    parse: async ({ correlationId, pathParameters, request }) => {
      await parseOptionalBody(emptyBodySchema, request)
      return { correlationId, previewId: parseUuidPathIdentifier(pathParameters.id ?? '') }
    },
    pathname: API_CARGO_PREVIEW_PROPOSE_ARRIVAL_PATH,
    policy: CARGO_ARRIVAL_MANAGE_POLICY,
  })
}
