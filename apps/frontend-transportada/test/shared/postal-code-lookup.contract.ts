/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  createPostalCodeClient,
  type PostalCodeSuggestion,
} from '@/modules/shared/postalCodeClient.service'
import { toPostalCodeFieldPatch } from '@/modules/shared/usePostalCodeLookup.hook'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const API_URL = 'https://api.transportada.test'
const CLIENT_PATH = 'src/modules/shared/postalCodeClient.service.ts'
const DRIVER_LOOKUP_PATH = 'src/modules/fleet/hooks/useDriverAddressLookup.hook.ts'
const FLEET_MODULE_PATH = 'src/modules/fleet/'
const GUARD_PATH = 'src/modules/shared/useGuardedRequest.hook.ts'
const HOOK_PATH = 'src/modules/shared/usePostalCodeLookup.hook.ts'
const POSTAL_CODE = '01310930'

/**
 * O host da BrasilAPI continua no módulo — ela serve o CNPJ e a lista do IBGE. O que saiu é o
 * caminho do CEP, e por isso a agulha é o caminho, não o domínio.
 */
const FORBIDDEN_POSTAL_CODE_NEEDLE = [
  'api/cep',
  'fromBrasilApi',
  'fromViaCep',
  'lookupPostalCode',
  'viacep.com.br',
] as const

type DriverFormFields = {
  readonly addressCity: string
  readonly addressDistrict: string
  readonly addressState: string
  readonly addressStreet: string
}

const DRIVER_FIELDS = {
  city: 'addressCity',
  district: 'addressDistrict',
  state: 'addressState',
  street: 'addressStreet',
} as const

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/** O `fetch` do Bun declara `preconnect`, que nenhum duplo de teste precisa implementar. */
function stubFetch(handler: (request: Request) => Promise<Response>): typeof globalThis.fetch {
  return handler as unknown as typeof globalThis.fetch
}

function suggestionOf(fields: Partial<PostalCodeSuggestion>): PostalCodeSuggestion {
  return { city: '', district: '', state: '', street: '', ...fields }
}

function clientWith(
  handler: (request: Request) => Promise<Response>,
): ReturnType<typeof createPostalCodeClient> {
  return createPostalCodeClient({
    apiUrl: API_URL,
    fetch: stubFetch(handler),
    getAccessToken: () => Promise.resolve('access-token'),
  })
}

describe('postal code lookup contract', () => {
  test('o CEP é consultado na nossa rota, com o token da sessão e sem cache', async () => {
    const requests: Request[] = []
    const client = clientWith((request) => {
      requests.push(request)
      return Promise.resolve(
        Response.json({
          data: {
            city: 'São Paulo',
            district: 'Bela Vista',
            state: 'sp',
            street: 'Avenida Paulista',
          },
        }),
      )
    })

    const suggestion = await client.lookup({
      postalCode: '01310-930',
      signal: new AbortController().signal,
    })

    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe(`${API_URL}/postal-codes/${POSTAL_CODE}`)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer access-token')
    expect(requests[0]?.cache).toBe('no-store')
    expect(suggestion).toEqual({
      city: 'São Paulo',
      district: 'Bela Vista',
      state: 'SP',
      street: 'Avenida Paulista',
    })
  })

  /** O provedor público saiu do navegador: quem fala com a BrasilAPI e o ViaCEP é a nossa API. */
  test('o cliente não nomeia provedor externo nenhum', async () => {
    const client = await readApplicationFile(CLIENT_PATH)

    expect(client).toContain('/postal-codes')
    expect(client).not.toContain('brasilapi')
    expect(client).not.toContain('viacep')
  })

  test('CEP incompleto não vai à rede', async () => {
    const requests: Request[] = []
    const client = clientWith((request) => {
      requests.push(request)
      return Promise.resolve(Response.json({ data: {} }))
    })
    const signal = new AbortController().signal

    expect(await client.lookup({ postalCode: '0131093', signal })).toBeNull()
    expect(await client.lookup({ postalCode: '', signal })).toBeNull()
    expect(requests).toEqual([])
  })

  /**
   * `404` é o "ninguém soube" — nem as nossas tabelas nem os provedores públicos acharam. Ele não é
   * erro de cadastro: o operador digita o endereço e segue, e é por isso que a resposta é vazia.
   */
  test('404, falha da rota e corpo estranho devolvem vazio', async () => {
    const signal = new AbortController().signal
    const notFound = clientWith(() =>
      Promise.resolve(Response.json({ error: { code: 'POSTAL_CODE_NOT_FOUND' } }, { status: 404 })),
    )
    const broken = clientWith(() => Promise.resolve(new Response('nope', { status: 500 })))
    const offline = clientWith(() => Promise.reject(new Error('network down')))
    const empty = clientWith(() =>
      Promise.resolve(Response.json({ data: { city: '', district: '', state: '', street: '' } })),
    )

    expect(await notFound.lookup({ postalCode: POSTAL_CODE, signal })).toBeNull()
    expect(await broken.lookup({ postalCode: POSTAL_CODE, signal })).toBeNull()
    expect(await offline.lookup({ postalCode: POSTAL_CODE, signal })).toBeNull()
    expect(await empty.lookup({ postalCode: POSTAL_CODE, signal })).toBeNull()
  })

  /** Pedido abortado é pedido velho: engoli-lo aqui deixaria a resposta antiga vencer a nova. */
  test('pedido abortado é repassado, não virado em vazio', async () => {
    const controller = new AbortController()
    const client = clientWith(() => Promise.reject(new Error('aborted')))
    controller.abort()

    let hasRejected = false
    try {
      await client.lookup({ postalCode: POSTAL_CODE, signal: controller.signal })
    } catch {
      hasRejected = true
    }

    expect(hasRejected).toBe(true)
  })

  test('a guarda de corrida é do escopo partilhado, e o pedido antigo não vence o novo', async () => {
    const [guard, hook] = await Promise.all([
      readApplicationFile(GUARD_PATH),
      readApplicationFile(HOOK_PATH),
    ])

    expect(guard).toContain('export function useGuardedRequest')
    expect(guard).toContain('sequence.current')
    expect(guard).toContain('if (ticket !== sequence.current) return')
    expect(hook).toContain("from './useGuardedRequest.hook'")
    expect(hook).toContain('useGuardedRequest()')
  })

  test('sugestão parcial não apaga campo preenchido', () => {
    const partial = toPostalCodeFieldPatch<DriverFormFields>({
      fields: DRIVER_FIELDS,
      suggestion: suggestionOf({ city: 'Barrinha', state: 'SP' }),
    })
    const complete = toPostalCodeFieldPatch<DriverFormFields>({
      fields: DRIVER_FIELDS,
      suggestion: suggestionOf({
        city: 'São Paulo',
        district: 'Bela Vista',
        state: 'SP',
        street: 'Avenida Paulista',
      }),
    })

    expect(partial).toEqual({ addressCity: 'Barrinha', addressState: 'SP' })
    expect(Object.keys(partial)).not.toContain('addressStreet')
    expect(Object.keys(partial)).not.toContain('addressDistrict')
    expect(complete).toEqual({
      addressCity: 'São Paulo',
      addressDistrict: 'Bela Vista',
      addressState: 'SP',
      addressStreet: 'Avenida Paulista',
    })
  })

  /**
   * Formulário sem os quatro campos não deixa de consultar: a lotação do MDF-e só tem a UF de
   * destino, e o CEP de carregamento não tem onde escrever — o status ainda diz se o CEP existe.
   */
  test('mapa parcial preenche só o que o formulário tem', () => {
    const suggestion = suggestionOf({
      city: 'São Paulo',
      district: 'Bela Vista',
      state: 'SP',
      street: 'Avenida Paulista',
    })
    const onlyState = toPostalCodeFieldPatch<{ readonly destinationState: string }>({
      fields: { state: 'destinationState' },
      suggestion,
    })
    const nothing = toPostalCodeFieldPatch<{ readonly loadingPostalCode: string }>({
      fields: {},
      suggestion,
    })

    expect(onlyState).toEqual({ destinationState: 'SP' })
    expect(nothing).toEqual({})
  })

  /**
   * CEP não achado não desabilita, não limpa e não bloqueia o envio: o estado `missing` é texto de
   * status, e o único caminho que escreve nos campos é o da sugestão que existe.
   */
  test('o miss não escreve no formulário nem tranca o campo', async () => {
    const hook = await readApplicationFile(HOOK_PATH)
    const [, missingBranch = ''] = hook.split('if (suggestion === null)')

    expect(hook).toContain('if (suggestion === null)')
    expect(missingBranch.slice(0, missingBranch.indexOf('}'))).not.toContain('patch(')
    expect(hook).toContain('POSTAL_CODE_LOOKUP_STATUS.missing')
    expect(hook).not.toContain('disabled')
    expect(hook).not.toContain('readOnly')
  })

  /** O CEP do motorista passa pela nossa rota: o módulo da frota não tem mais consulta própria. */
  test('o formulário do motorista consulta o CEP pelo hook partilhado', async () => {
    const driverHook = await readApplicationFile(DRIVER_LOOKUP_PATH)

    expect(driverHook).toContain('usePostalCodeLookup')
    expect(driverHook).toContain('addressLookupPending')
    expect(driverHook).toContain('addressLookupMissing')
    expect(driverHook).toContain('addressLookupFound')
    expect(driverHook).not.toContain('lookupPostalCode')
  })

  /**
   * Provedor de CEP consultado do navegador mandava o CEP residencial para terceiro sem contrato.
   * A busca textual do Photon continua — ela é outra consulta, e sai em outra tarefa.
   */
  test('o módulo da frota não nomeia mais provedor de CEP', async () => {
    const glob = new Bun.Glob('**/*.{json,ts,tsx}')
    const files: string[] = []
    for await (const file of glob.scan({
      cwd: new URL(FLEET_MODULE_PATH, APPLICATION_ROOT).pathname,
    }))
      files.push(file)
    expect(files.length).toBeGreaterThan(0)

    const contents = await Promise.all(
      files.map((file) => readApplicationFile(`${FLEET_MODULE_PATH}${file}`)),
    )

    for (const [index, content] of contents.entries()) {
      for (const needle of FORBIDDEN_POSTAL_CODE_NEEDLE) {
        expect(`${files[index] ?? ''}:${needle}:${content.includes(needle)}`).toBe(
          `${files[index] ?? ''}:${needle}:false`,
        )
      }
    }
  })
})
