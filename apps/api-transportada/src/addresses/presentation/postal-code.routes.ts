/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O segmento do caminho é o CEP, não um UUID: sem `pathParameterFormat: 'raw'` o roteador nem casa a
 * rota, e o preflight responde 403 antes de a chamada existir.
 */
import { defineRoute } from '../../http/router.service.js'
import { API_POSTAL_CODES_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { LookupPostalCodeUseCase } from '../application/lookup-postal-code.use-case.js'
import { PostalCodeNotFoundError } from '../domain/postal-code.error.js'
import { parsePostalCodePathParameter } from './postal-code.schema.js'

const ADDRESSES_READ_POLICY = { permission: 'addresses.read', scope: 'company' } as const
const POSTAL_CODE_PATH = `${API_POSTAL_CODES_PATH}/:postalCode`
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type LookupInput = {
  readonly postalCode: string
}

type Dependencies = {
  readonly lookup: LookupPostalCodeUseCase
}

export function createPostalCodeRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<LookupInput>({
      async handle({ context, input }): Promise<Response> {
        const suggestion = await dependencies.lookup.execute({
          companyId: context.scope.companyId,
          postalCode: input.postalCode,
        })
        // Ausência é 404 e não 200 com corpo vazio: é o 404 que o cliente lê como "digite você"
        if (suggestion === null) {
          throw new PostalCodeNotFoundError()
        }

        return new Response(JSON.stringify({ data: suggestion }), {
          headers: NO_STORE_HEADERS,
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        postalCode: parsePostalCodePathParameter(pathParameters.postalCode ?? ''),
      }),
      pathParameterFormat: 'raw',
      pathname: POSTAL_CODE_PATH,
      policy: ADDRESSES_READ_POLICY,
    }),
  ]
}
