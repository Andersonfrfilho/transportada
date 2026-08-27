/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Amarrar uma conta a um contratante é **conceder acesso a uma pessoa de fora**, e por isso a
 * permissão é `users.manage` — a mesma de convidar e desabilitar usuário —, e não `settings.manage`,
 * que administra o cadastro do contratante. As duas coisas moram na mesma tela e são decisões
 * diferentes: uma muda para quem se cobra, a outra muda quem enxerga a operação.
 */
import { z } from 'zod'

import { defineRoute } from '../../http/router.service.js'
import { parseBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_CONTRACTORS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { ContractorPortalBinding } from '../application/contractor-portal-binding.port.js'

const PORTAL_USERS_PATH = `${API_CONTRACTORS_PATH}/:id/portal-users`
const PORTAL_USER_PATH = `${PORTAL_USERS_PATH}/:membershipId`

const MANAGE_POLICY = { permission: 'users.manage', scope: 'company' } as const

const bindSchema = z.object({ membershipId: z.string().uuid() }).strict()

export type ContractorPortalBindingRoutesDependencies = {
  readonly bindPortalUser: {
    execute(input: {
      readonly context: CompanyContext
      readonly contractorId: string
      readonly membershipId: string
    }): Promise<ContractorPortalBinding>
  }
  readonly listPortalUsers: {
    execute(input: {
      readonly context: CompanyContext
      readonly contractorId: string
    }): Promise<readonly ContractorPortalBinding[]>
  }
  readonly unbindPortalUser: {
    execute(input: {
      readonly context: CompanyContext
      readonly contractorId: string
      readonly membershipId: string
    }): Promise<void>
  }
}

export function createContractorPortalBindingRoutes(
  dependencies: ContractorPortalBindingRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{ readonly contractorId: string }>({
      async handle({ context, input }): Promise<Response> {
        const bindings = await dependencies.listPortalUsers.execute({
          context: context.scope,
          contractorId: input.contractorId,
        })

        return jsonResponse({ body: { data: bindings.map(serialize) }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        contractorId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: PORTAL_USERS_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<{ readonly contractorId: string; readonly membershipId: string }>({
      async handle({ context, input }): Promise<Response> {
        const binding = await dependencies.bindPortalUser.execute({
          context: context.scope,
          contractorId: input.contractorId,
          membershipId: input.membershipId,
        })

        return jsonResponse({ body: { data: serialize(binding) }, status: 201 })
      },
      method: 'POST',
      parse: async ({ pathParameters, request }) => ({
        contractorId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        membershipId: (await parseBody(bindSchema, request)).membershipId,
      }),
      pathname: PORTAL_USERS_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<{ readonly contractorId: string; readonly membershipId: string }>({
      async handle({ context, input }): Promise<Response> {
        await dependencies.unbindPortalUser.execute({
          context: context.scope,
          contractorId: input.contractorId,
          membershipId: input.membershipId,
        })

        return new Response(null, { status: 204 })
      },
      method: 'DELETE',
      parse: ({ pathParameters }) => ({
        contractorId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        membershipId: parseUuidPathIdentifier(pathParameters.membershipId ?? ''),
      }),
      pathname: PORTAL_USER_PATH,
      policy: MANAGE_POLICY,
    }),
  ]
}

/**
 * O vínculo publica **o par**: `membershipId` é o que a rota recebe de volta, e `userId` é a pessoa.
 * O mesmo motivo de `/company-users` publicar os dois — sem o vínculo, quem administra teria de
 * digitar um UUID de trinta e seis caracteres.
 */
function serialize(binding: ContractorPortalBinding): Record<string, unknown> {
  return {
    contractorId: binding.contractorId,
    email: binding.email,
    id: binding.id,
    membershipId: binding.membershipId,
    name: binding.name,
    userId: binding.userId,
  }
}

function jsonResponse(input: {
  readonly body: Record<string, unknown>
  readonly status: number
}): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}
