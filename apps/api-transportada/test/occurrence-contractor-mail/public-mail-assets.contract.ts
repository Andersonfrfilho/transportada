import { describe, expect, test } from 'bun:test'
import { buildPublicMailAssetUrls } from '../../src/occurrence-conversation/domain/occurrence-mail-html.constant.js'
import { createPublicMailAssetRoutes } from '../../src/occurrence-conversation/presentation/public-mail-assets.routes.js'

const COMPANY = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const IMAGE = { bytes: Buffer.from('png'), mimeType: 'image/png', sha256: 'abc' }

function routes(found: boolean) {
  const whiteCalls: number[] = []
  const lookups: unknown[] = []
  const list = createPublicMailAssetRoutes({
    companyLogo: {
      find: async (input) => {
        lookups.push(input)
        return found ? (IMAGE as never) : null
      },
    },
    userPicture: {
      find: async (input) => {
        lookups.push(input)
        return found ? (IMAGE as never) : null
      },
    },
    whiteLogo: async () => {
      whiteCalls.push(1)
      return Buffer.from('white')
    },
  })
  return { list, lookups, whiteCalls }
}

async function call(
  route: ReturnType<typeof routes>['list'][number],
  pathParameters: Record<string, string>,
) {
  return route.execute({
    correlationId: 'c',
    limitTarget: undefined as never,
    pathParameters,
    request: new Request('https://api.example.test/x'),
  } as never)
}

describe('imagens públicas do e-mail da ocorrência', () => {
  test('os endereços não levam credencial: só os ids da empresa e da pessoa', () => {
    const urls = buildPublicMailAssetUrls({
      apiPublicUrl: 'https://api.example.test/',
      companyId: COMPANY,
    })

    expect(urls?.logo).toBe(`https://api.example.test/public/mail-assets/${COMPANY}/logo`)
    expect(urls?.logoWhite).toBe(
      `https://api.example.test/public/mail-assets/${COMPANY}/logo-white`,
    )
    expect(urls?.picture(USER)).toBe(
      `https://api.example.test/public/mail-assets/${COMPANY}/users/${USER}/picture`,
    )
  })

  test('sem origem pública (ou que não é http), sem endereço', () => {
    expect(
      buildPublicMailAssetUrls({ apiPublicUrl: undefined, companyId: COMPANY }),
    ).toBeUndefined()
    expect(
      buildPublicMailAssetUrls({ apiPublicUrl: 'javascript:1', companyId: COMPANY }),
    ).toBeUndefined()
  })

  test('logo e foto abrem sem login, com a empresa da URL no recorte', async () => {
    const { list, lookups } = routes(true)
    const logo = await call(list[0] as never, { companyId: COMPANY })
    const picture = await call(list[2] as never, { companyId: COMPANY, userId: USER })

    expect(logo.status).toBe(200)
    expect(logo.headers.get('content-type')).toBe('image/png')
    expect(picture.status).toBe(200)
    expect(lookups).toEqual([{ companyId: COMPANY }, { companyId: COMPANY, userId: USER }])
  })

  test('logo-white serve a silhueta em PNG', async () => {
    const { list, whiteCalls } = routes(true)
    const route = list.find((candidate) => candidate.pathname.endsWith('/logo-white'))
    const first = await call(route as never, { companyId: COMPANY })

    expect(first.status).toBe(200)
    expect(first.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await first.arrayBuffer()).toString()).toBe('white')
    expect(whiteCalls.length).toBe(1)
  })

  test('id torto não consulta o banco; ausente é 404', async () => {
    const { list, lookups } = routes(false)

    await expect(call(list[0] as never, { companyId: 'x' })).rejects.toBeDefined()
    expect(lookups).toEqual([])
    await expect(call(list[2] as never, { companyId: COMPANY, userId: USER })).rejects.toBeDefined()
  })
})
