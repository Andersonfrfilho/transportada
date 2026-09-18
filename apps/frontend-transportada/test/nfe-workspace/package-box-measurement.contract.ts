/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  firstUnreliableDimension,
  initialDimensionCentimetres,
} from '../../src/modules/nfe-workspace/shared/packageBoxMeasurementProposal.service'
import {
  buildPackageBoxMeasurementSubmission,
  type PackageBoxMeasurementSubmissionInput,
} from '../../src/modules/nfe-workspace/shared/packageBoxMeasurementSubmission.service'

import {
  createPackageBoxClient,
  packageBoxQueueFromApi,
} from '@/modules/nfe-workspace/shared/packageBoxClient.service'
import { CAMERA_MEASUREMENT_IS_EXPERIMENTAL } from '@/modules/nfe-workspace/shared/packageBoxMeasurement.constant'
import { measurementSourceLabel } from '@/modules/nfe-workspace/shared/packageBoxMeasurementLabel.service'
import { isRepeatedScan } from '@/modules/nfe-workspace/hooks/usePackageBoxQueue.hook'

const BOX = {
  cartonGtin: null,
  commercialUnit: 'CX24',
  cumulativeShare: 0.6,
  description: 'ENERG RED BULL 250ML',
  emitterTaxId: '05868574001090',
  /** Spec 155 (D2, D9): ausente por padrão — a maioria dos casos de teste não tem família. */
  familyKey: undefined,
  familyMeasuredCount: 0,
  familyPendingCount: 0,
  grossWeightGrams: 10867,
  heightMm: null,
  id: '11111111-1111-4111-8111-111111111111',
  lengthMm: null,
  measuredAt: null,
  measurementMarginMm: null,
  measurementSource: null,
  packagingSiblingCount: 0,
  packagingUnitCount: undefined,
  productCode: '18245',
  share: 0.6,
  transportedVolumes: 60,
  unitsPerBox: 1,
  variantLabel: '',
  widthMm: null,
  withinCoverage: true,
}

function buildFetch(body: unknown, captured?: { url?: string; init?: RequestInit | undefined }) {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (captured !== undefined) {
      captured.url = input instanceof URL ? input.href : (input as string)
      captured.init = init
    }
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    )
  }
}

function buildClient(body: unknown, captured?: { url?: string; init?: RequestInit | undefined }) {
  return createPackageBoxClient({
    apiUrl: 'https://api.test',
    fetch: buildFetch(body, captured),
    getAccessToken: () => Promise.resolve('token'),
  })
}

describe('a fila de medição vista pelo conferente (spec 085 G005)', () => {
  it('lê a fila que a API serve', () => {
    const queue = packageBoxQueueFromApi({
      data: { coveredCount: 1, items: [BOX], totalVolumes: 100 },
    })

    expect(queue.coveredCount).toBe(1)
    expect(queue.items[0]?.productCode).toBe('18245')
  })

  /**
   * ⚠️ Corpo que não é a fila **lança**, nunca vira lista vazia: fila vazia é "não há o que medir",
   * e mostrar isso para uma resposta que não entendemos manda o conferente embora sem trabalho.
   */
  it('recusa corpo que não é a fila', () => {
    expect(() => packageBoxQueueFromApi({ data: { items: [{ id: 1 }] } })).toThrow()
    expect(() => packageBoxQueueFromApi(null)).toThrow()
  })

  /** A fila abre no que falta medir: ela existe para dizer o que medir agora. */
  it('a situação padrão é o que falta medir', async () => {
    const captured: { url?: string } = {}
    await buildClient(
      { data: { coveredCount: 0, items: [], totalVolumes: 0 } },
      captured,
    ).listBoxes({ status: 'pending' })

    expect(captured.url).toContain('status=pending')
  })

  /** Ver o já medido é o caminho de conferir e corrigir uma caixa — não some atrás de um checkbox. */
  it('pede as medidas quando o operador troca a situação', async () => {
    const captured: { url?: string } = {}
    await buildClient(
      { data: { coveredCount: 0, items: [], totalVolumes: 0 } },
      captured,
    ).listBoxes({ status: 'all' })

    expect(captured.url).toContain('status=all')
  })

  /** O que o leitor bipa vai como `scanned`: quem reduz DUN-14 a GTIN-13 é a API, não a tela. */
  it('manda a etiqueta lida como scanned, sem reduzi-la aqui', async () => {
    const captured: { url?: string } = {}
    await buildClient(
      { data: { coveredCount: 0, items: [], totalVolumes: 0 } },
      captured,
    ).listBoxes({ scanned: '17896004003405' })

    expect(captured.url).toContain('scanned=17896004003405')
    expect(captured.url).not.toContain('7896004003405&')
  })

  /** Gravar é `PUT` na caixa: medir de novo substitui a medida, não acrescenta uma segunda. */
  it('grava a medida por PUT na própria caixa', async () => {
    const captured: { init?: RequestInit; url?: string } = {}
    await buildClient({ data: BOX }, captured).measureBox({
      grossWeightGrams: null,
      heightMm: 200,
      id: BOX.id,
      lengthMm: 400,
      unitsPerBox: 1,
      widthMm: 300,
    })

    expect(captured.url).toBe(`https://api.test/nfe-package-boxes/${BOX.id}`)
    expect(captured.init?.method).toBe('PUT')
  })
})

/**
 * Spec 155 (T3.1, G003, G004, G009): o cliente ganha as duas rotas novas — `listSiblings` (D1, D9,
 * D11) e `replicate` (D4, D6). `measurementSource` ganha `replicated` (D6), senão a primeira réplica
 * gravada quebra a leitura da fila inteira (o guard recusava o valor e `packageBoxQueueFromApi`
 * lançava para toda a resposta, não só para a caixa replicada).
 */
describe('família de variação e réplica de medida (spec 155)', () => {
  it('lê as irmãs de família e de embalagem da caixa', async () => {
    const captured: { init?: RequestInit; url?: string } = {}
    const sibling = {
      commercialUnit: 'CX36',
      description: 'SAB FARNESE 180G AVEIA ESFOLIANT',
      grossWeightGrams: null,
      heightMm: null,
      id: '22222222-2222-4222-8222-222222222222',
      lengthMm: null,
      measuredAt: null,
      measurementSource: null,
      packagingUnitCount: 36,
      productCode: '6959',
      unitsPerBox: 1,
      variantLabel: 'AVEIA ESFOLIANT',
      widthMm: null,
    }
    const siblings = await buildClient(
      {
        data: {
          family: [sibling],
          isLowConfidenceFamily: false,
          originVariantLabel: 'PURO E HIDRATAN',
          packaging: [],
        },
      },
      captured,
    ).listSiblings({ boxId: BOX.id })

    expect(captured.url).toBe(`https://api.test/nfe-package-boxes/${BOX.id}/siblings`)
    expect(captured.init?.method ?? 'GET').toBe('GET')
    expect(siblings.family).toEqual([sibling])
    expect(siblings.isLowConfidenceFamily).toBe(false)
    expect(siblings.originVariantLabel).toBe('PURO E HIDRATAN')
  })

  it('recusa resposta de irmãs que não é a esperada', () => {
    expect(
      buildClient({ data: { family: [{ id: 1 }], packaging: [] } }).listSiblings({
        boxId: BOX.id,
      }),
    ).rejects.toThrow()
  })

  /** D4/D6/G004: replicar é POST com os alvos, e devolve quantos gravou. */
  it('replica a medida por POST com os alvos escolhidos', async () => {
    const captured: { init?: RequestInit; url?: string } = {}
    const result = await buildClient({ data: { replicatedCount: 2 } }, captured).replicate({
      boxId: BOX.id,
      targetIds: ['a', 'b'],
    })

    expect(captured.url).toBe(`https://api.test/nfe-package-boxes/${BOX.id}/replicate`)
    expect(captured.init?.method).toBe('POST')
    expect(JSON.parse(captured.init?.body as string)).toEqual({ targetIds: ['a', 'b'] })
    expect(result).toEqual({ replicatedCount: 2 })
  })

  /** D6: caixa replicada precisa ser identificável na fila — a leitura não pode recusar o valor. */
  it('aceita measurementSource replicated na leitura da fila', () => {
    const queue = packageBoxQueueFromApi({
      data: {
        coveredCount: 1,
        items: [{ ...BOX, measurementMarginMm: null, measurementSource: 'replicated' }],
        totalVolumes: 100,
      },
    })

    expect(queue.items[0]?.measurementSource).toBe('replicated')
  })

  /** D2/D9: os contadores e o rótulo da família chegam junto de cada item da fila. */
  it('lê os contadores de família e embalagem de cada item da fila', () => {
    const queue = packageBoxQueueFromApi({
      data: {
        coveredCount: 1,
        items: [
          {
            ...BOX,
            familyKey: '05868574001090|SAB FARNESE 180G|CX36',
            familyMeasuredCount: 1,
            familyPendingCount: 4,
            packagingSiblingCount: 1,
            packagingUnitCount: 36,
            variantLabel: 'PURO E HIDRATAN',
          },
        ],
        totalVolumes: 100,
      },
    })

    const [item] = queue.items
    expect(item?.familyKey).toBe('05868574001090|SAB FARNESE 180G|CX36')
    expect(item?.familyPendingCount).toBe(4)
    expect(item?.familyMeasuredCount).toBe(1)
    expect(item?.packagingSiblingCount).toBe(1)
    expect(item?.packagingUnitCount).toBe(36)
    expect(item?.variantLabel).toBe('PURO E HIDRATAN')
  })

  /** Item sem família (D2): `familyKey` ausente e `packagingUnitCount` ausente continuam válidos. */
  it('aceita item sem família nem sufixo numérico de unidade', () => {
    const queue = packageBoxQueueFromApi({
      data: { coveredCount: 0, items: [BOX], totalVolumes: 0 },
    })

    expect(queue.items[0]?.familyKey).toBeUndefined()
    expect(queue.items[0]?.packagingUnitCount).toBeUndefined()
  })
})

describe('o hook expõe a réplica e as irmãs sob demanda (T3.1)', () => {
  it('a mutação de replicar invalida a fila e as irmãs carregam por hook próprio', async () => {
    const source = await Bun.file(
      new URL('../../src/modules/nfe-workspace/hooks/usePackageBoxQueue.hook.ts', import.meta.url),
    ).text()

    expect(source).toContain('replicate')
    /** A fila entra pelo registro de efeitos — `mutation-invalidation.contract.ts` cobra a chave. */
    expect(source).toContain('MUTATION_EFFECT.packageBoxMeasurement')
    /** D9: as irmãs nunca vêm junto da fila de 50 linhas — hook próprio, não campo do retorno principal. */
    expect(source).toContain('export function usePackageBoxSiblings')
    expect(source).toContain("queryKey: [PACKAGE_BOX_QUERY_KEY, 'siblings', boxId]")
    /** M1/M2 (re-revisão): a mesma chave/função serve a busca sob demanda do "aplicar a todos". */
    expect(source).toContain('export function usePackageBoxSiblingsFetcher')
  })
})

/**
 * ⚠️ Contrato por texto de fonte: esta app não tem DOM nos testes, e o ciclo bipar → medir → bipar
 * é justamente o que some quando alguém "simplifica" o painel. Sem ele o conferente toca "Ler
 * etiqueta" uma vez por caixa, com a fita na outra mão.
 */
describe('o ciclo do leitor no painel de medição', () => {
  it('reabre a câmera depois de gravar quando a caixa veio de uma leitura', async () => {
    const source = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(source).toContain('if (cameFromScan) setIsScannerOpen(true)')
    expect(source).toContain('setCameFromScan(true)')
    /** Digitar sai do modo varredura: ali a pessoa procura uma caixa, não passa uma pilha. */
    expect(source).toContain('setCameFromScan(false)')
  })
})

/**
 * ⚠️ Os tetos da medida são cópia por valor dos CHECKs da coluna. Divergir deles devolve `400`
 * genérico do servidor, que a tela não sabe ancorar em campo nenhum — o operador lê "não foi
 * possível gravar" numa ficha de três campos e não sabe qual refazer.
 *
 * ⚠️ Extraído para `packageBoxMeasurementUnits.service.ts` e `PackageBoxMeasurementForm.component.tsx`
 * na T10 (spec 152): o formulário digitado e o formulário da câmera passaram a compartilhar a mesma
 * conversão, em vez de duas cópias dentro de `PackageBoxMeasurementPanel`.
 */
describe('os tetos da medida na tela e no banco', () => {
  it('a tela declara os mesmos limites do CHECK da coluna', async () => {
    const units = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/shared/packageBoxMeasurementUnits.service.ts',
        import.meta.url,
      ),
    ).text()
    const form = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementForm.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(units).toContain('{ heightMm: 300, lengthMm: 600, widthMm: 300 }')
    expect(form).toContain('aria-invalid=')
  })

  /**
   * ⚠️ **A tela fala centímetro e o banco guarda milímetro**, e é aqui que um erro de ordem de
   * grandeza entraria calado: 38 cm virando 38 mm passa em qualquer CHECK, cabe em qualquer coluna,
   * e só aparece quando a ocupação da viagem der um décimo do que deveria. A conversão mora num
   * lugar só, e é este teste que a prende ali.
   */
  it('converte centímetro em milímetro num lugar só, aceitando vírgula', async () => {
    const units = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/shared/packageBoxMeasurementUnits.service.ts',
        import.meta.url,
      ),
    ).text()

    expect(units).toContain('const MILLIMETRES_PER_CENTIMETRE = 10')
    expect(units).toContain('Math.round(centimetres * MILLIMETRES_PER_CENTIMETRE)')
    /** O teclado do celular manda `38,5`, e meio centímetro é medida legítima. */
    expect(units).toContain("replace(',', '.')")
    /** O teto é conferido **em centímetro**, antes de multiplicar: senão 600 cm passaria. */
    expect(units).toContain('if (centimetres > MAX_CENTIMETRES[field]) return null')
  })
})

/**
 * ⚠️ O CORS da API só admite `Authorization` em metodo sem corpo (`BODYLESS_METHODS` em
 * `cors.service.ts`). Mandar `content-type` num `GET` faz o navegador pedir
 * `authorization,content-type` no preflight e receber **403** — a fila some da tela inteira, e
 * nenhum teste desta app pega, porque preflight so existe no navegador. Medido em 06/09/2026.
 */
describe('os cabeçalhos que cada método manda', () => {
  it('a leitura da fila manda só Authorization', async () => {
    const captured: { init?: RequestInit | undefined; url?: string } = {}
    await buildClient(
      { data: { coveredCount: 0, items: [], totalVolumes: 0 } },
      captured,
    ).listBoxes()

    const headers = captured.init?.headers as Record<string, string>
    expect(Object.keys(headers)).toEqual(['authorization'])
  })

  /** A gravação tem corpo, e aí o cabeçalho descreve algo — e o método deixa de ser sem corpo. */
  it('a gravação manda Authorization e content-type', async () => {
    const captured: { init?: RequestInit | undefined; url?: string } = {}
    await buildClient(null, captured).measureBox({
      grossWeightGrams: null,
      heightMm: 200,
      id: BOX.id,
      lengthMm: 400,
      unitsPerBox: 1,
      widthMm: 300,
    })

    const headers = captured.init?.headers as Record<string, string>
    expect(Object.keys(headers).sort()).toEqual(['authorization', 'content-type'])
  })
})

/**
 * ⚠️ **Editar uma medida abre preenchido.** Campo em branco sobre dado que existe é a falha que o
 * registro evita (mesma regra de `CargoVolumeFactorPanel`) — e aqui ela era pior que estética: com
 * `unidades por caixa` voltando a `1`, gravar por cima **apagava** a medida em silêncio, e a
 * ocupação da viagem passava a contar cada unidade como uma caixa inteira.
 */
/**
 * ⚠️ O leitor abre em camada de tela cheia (primitivo `BarcodeScanner`) e precisa continuar montado
 * enquanto a fila reconsulta a API por causa de um bipe — senão o retorno ao estado de
 * carregamento (`loading`) desmontava a câmera no meio da leitura. O ciclo bipar → achar a caixa →
 * abrir a medição é a ponte para a medição por câmera (spec separada em andamento); o defeito
 * relatado era o leitor nascer atrás da lista sem preview algum.
 */
describe('o leitor de etiqueta e o fluxo da câmera continuam montados em toda situação da fila', () => {
  /**
   * ⚠️ T14 item ALTO-1 (5ª revisão): a correção da 4ª revisão só tratou `failed` — `if (loading)
   * return` e `if (denied) return` continuavam ACIMA de `PackageBoxCameraFlow`. Bipar a etiqueta
   * com o fluxo aberto faz `scanned` entrar na `queryKey`; sem dado prévio para a chave nova,
   * `isLoading` vira `true` (sem `placeholderData`, `staleTime` 30s não ajuda) e o painel devolvia
   * `<>{scanner}<QueueSkeleton/></>` — o fluxo DESMONTAVA, `useReducer` voltava para `step: 'label'`,
   * `useCameraStream` derrubava o `MediaStream` e refazia `getUserMedia` no remount (viola D19), e a
   * caixa achada nunca era consumida: o conferente precisava bipar a mesma etiqueta duas vezes.
   * `denied`, `loading` e `failed` são agora ramos do MESMO `return` — nenhum é retorno antecipado.
   */
  it('denied, loading e failed são ramos do mesmo return — nenhum retorna antes de PackageBoxCameraFlow', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).not.toContain('if (denied)')
    expect(panel).not.toContain('if (loading)')
    expect(panel).not.toContain('if (failed)')

    expect(panel).toContain('{denied ? (')
    expect(panel).toContain(') : loading ? (')
    expect(panel).toContain(') : failed ? (')
    expect(panel).toContain('<QueueSkeleton />')
  })

  it('scanner e PackageBoxCameraFlow renderizam uma única vez, depois dos três ramos', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    const scannerReturns = panel.match(/\{scanner\}/g) ?? []
    expect(scannerReturns.length).toBe(1)
    const cameraFlowOccurrences = panel.match(/<PackageBoxCameraFlow/g) ?? []
    expect(cameraFlowOccurrences.length).toBe(1)

    const deniedIndex = panel.indexOf('{denied ? (')
    const scannerIndex = panel.indexOf('{scanner}')
    const cameraFlowIndex = panel.indexOf('<PackageBoxCameraFlow')
    expect(deniedIndex).toBeGreaterThan(-1)
    expect(scannerIndex).toBeGreaterThan(deniedIndex)
    expect(cameraFlowIndex).toBeGreaterThan(scannerIndex)
  })

  /**
   * ⚠️ T14 item ALTO-1 (4ª revisão, mantido na 5ª): o ramo `failed` continua com saída própria
   * (botão "Tentar de novo") para quem nem chegou a abrir a câmera — o `lookupFailed` do próprio
   * fluxo trata a falha para quem já estava dentro.
   */
  it('a falha de consulta tem saída própria dentro do mesmo ramo', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('onClick={onRetryLookup}')
    expect(panel).toContain("t('packageBoxes.retry')")
  })

  /**
   * Reforço complementar ao ALTO-1 (5ª revisão, não substitui a correção estrutural acima): a
   * consulta mantém os dados anteriores durante o refetch de um bipe, então `isLoading` deixa de
   * virar `true` a cada etiqueta lida — só o carregamento inicial (sem dado nenhum em cache) ainda
   * é `loading`.
   */
  it('a consulta mantém o dado anterior durante o refetch do bipe (placeholderData)', async () => {
    const hook = await Bun.file(
      new URL('../../src/modules/nfe-workspace/hooks/usePackageBoxQueue.hook.ts', import.meta.url),
    ).text()

    expect(hook).toContain('keepPreviousData')
    expect(hook).toContain('placeholderData: keepPreviousData')
  })
})

/**
 * ⚠️ Bipar substitui procurar na lista: achando a caixa, a medição dela abre sozinha — o
 * conferente não caça a linha certa numa fila que pode ter dezenas. Não achando, o leitor avisa e
 * continua lendo, porque a próxima etiqueta pode ser a certa.
 */
describe('bipar leva direto à medição da caixa achada', () => {
  it('acertar a fila abre a edição da caixa achada, com feedback visual e vibração', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('function openMeasurementForScannedBox(id: string): void {')
    expect(panel).toContain("kind: 'found'")
    expect(panel).toContain('setEditingId(id)')
    expect(panel).toContain('setCameFromScan(true)')
  })

  it('não achar mantém o leitor aberto e lendo, com aviso', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain("kind: 'notFound'")
    /** Não achar não fecha o leitor — o bloco que trata a ausência de caixa não chama `setIsScannerOpen`. */
    const notFoundBlock = panel.split('if (items.length === 0) {')[1]?.split('}')[0]
    expect(notFoundBlock).toBeDefined()
    expect(notFoundBlock).not.toContain('setIsScannerOpen')
  })

  /**
   * T14 item A5: antes isto procurava o texto de um comentário que anunciava a câmera como spec
   * futura — passava com o comentário e sem fluxo nenhum. A câmera chegou (T11); o que precisa
   * valer agora é que o painel entregue ao fluxo o desfecho da consulta e o da gravação, senão
   * falha de rede vira "nenhuma caixa" (M7) e recusa de `PUT` some (A1).
   */
  it('o painel entrega ao fluxo da câmera o desfecho da consulta e o da gravação', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    const flowBlock = panel.split('<PackageBoxCameraFlow')[1]?.split('/>')[0]
    expect(flowBlock).toBeDefined()
    expect(flowBlock).toContain('lookupFailed={failed}')
    expect(flowBlock).toContain('saveErrorCode={saveErrorCode}')
    expect(flowBlock).toContain('saveStatus={saveStatus}')
  })

  /**
   * ⚠️ **O código da recusa não pode sobreviver à caixa.** Ele só era limpo em `onMutate`, e o
   * fluxo mostra o aviso sempre que houver código: a caixa seguinte abria a Conferência com a
   * recusa da anterior estampada (2ª revisão, item M-a). Limpa no sucesso, e o fluxo pede o reset
   * ao abrir.
   */
  it('M-a: a recusa da gravação anterior não vaza para a caixa seguinte', async () => {
    const hook = await Bun.file(
      new URL('../../src/modules/nfe-workspace/hooks/usePackageBoxQueue.hook.ts', import.meta.url),
    ).text()
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    const onSuccess = hook.split('onSuccess: () => {')[1]?.split('},')[0] ?? ''
    expect(onSuccess).toContain('setMeasureErrorCode(undefined)')
    expect(hook).toContain('resetMeasure')
    expect(hook).toContain('measure.reset()')
    expect(panel).toContain('onResetSaveError')
  })

  /**
   * ⚠️ **Reler a MESMA etiqueta depois de uma falha de consulta não fazia nada.** `onLookup` é
   * `setScanned`, `scanned` está na `queryKey`, e com `retry: false` a consulta fica em erro: regravar
   * o mesmo texto não muda a chave e o TanStack Query não refaz nada. O fluxo mandava "leia a
   * etiqueta de novo", o conferente lia, e a tela ficava parada na falha (3ª revisão, item M1).
   */
  /**
   * ⚠️ MÉDIO-2 (T14, 4ª revisão): a versão anterior era varredura de texto-fonte de `setScanned` —
   * passava sem exercitar comportamento nenhum. Esta app não tem renderer de hooks
   * (`@testing-library/react` ausente, confirmado antes de escrever este teste — sem introduzir
   * dependência nova), então a decisão saiu do hook para `isRepeatedScan`, função pura, testada de
   * verdade aqui.
   */
  it('M1: reler a mesma etiqueta depois da falha decide refazer a consulta, não trocar o estado', async () => {
    expect(isRepeatedScan({ current: '7896004003405', next: '7896004003405' })).toBe(true)
    expect(isRepeatedScan({ current: '7896004003405', next: '17896004003405' })).toBe(false)
    expect(isRepeatedScan({ current: null, next: '7896004003405' })).toBe(false)
    expect(isRepeatedScan({ current: '7896004003405', next: null })).toBe(false)

    const hook = await Bun.file(
      new URL('../../src/modules/nfe-workspace/hooks/usePackageBoxQueue.hook.ts', import.meta.url),
    ).text()
    expect(hook).toContain('void query.refetch()')
  })

  /**
   * ⚠️ MÉDIO-A (T14, 5ª revisão): o commit 93217ef7 tirou a asserção que amarrava `retryLookup`/
   * `isRepeatedScan` ao PONTO DE USO — sem ela dava para apagar a chamada dentro de `setScanned` e
   * a suíte continuava verde, porque só a função pura era testada. `isRepeatedScan` mora em módulo
   * próprio (`packageBoxScan.ts`, BAIXO-5) e o hook a reexporta — o teste de uso lê o bloco de
   * `setScanned` no hook, não no módulo novo.
   */
  it('MÉDIO-A: o ponto de uso do bipe repetido chama isRepeatedScan e retryLookup dentro de setScanned', async () => {
    const hook = await Bun.file(
      new URL('../../src/modules/nfe-workspace/hooks/usePackageBoxQueue.hook.ts', import.meta.url),
    ).text()

    const setScannedBlock = hook
      .split('setScanned: (value: null | string) => {')[1]
      ?.split('setSearch: (value: string) => {')[0]
    expect(setScannedBlock).toBeDefined()
    expect(setScannedBlock).toContain('isRepeatedScan(')
    expect(setScannedBlock).toContain('retryLookup()')
  })

  it('usa o sinal de refetch da fila (isFetching), não o carregamento inicial, para saber quando avaliar', async () => {
    const hook = await Bun.file(
      new URL('../../src/modules/nfe-workspace/hooks/usePackageBoxQueue.hook.ts', import.meta.url),
    ).text()
    expect(hook).toContain('isMatching: query.isFetching')

    const page = await Bun.file(
      new URL('../../src/modules/nfe-workspace/pages/NfeWorkspace.page.tsx', import.meta.url),
    ).text()
    expect(page).toContain('matching={packageBoxes.isMatching}')
  })
})

/**
 * ⚠️ O GTIN ainda não é gravado nas caixas (chega com o pacote fiscal numa etapa seguinte) — hoje
 * a etiqueta casa por chave de acesso ou código de produto, e o segundo pode achar a mesma caixa em
 * emitentes diferentes. Escolher a primeira sozinha (o `[match] = queue?.items ?? []` antigo) seria
 * adivinhar; o operador decide, tocando na candidata certa.
 */
describe('mais de uma caixa achada pela mesma etiqueta', () => {
  it('uma candidata só continua abrindo a medição direto, sem lista', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('if (items.length === 0) {')
    expect(panel).toContain('if (items.length > 1) {')
    expect(panel).toContain('setCandidates(items)')
    expect(panel).toContain('const [match] = items')
    expect(panel).toContain('if (match !== undefined) openMeasurementForScannedBox(match.id)')
  })

  it('nenhuma candidata segue mostrando o aviso de não achou, sem abrir a lista', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    const zeroBlock = panel.split('if (items.length === 0) {')[1]?.split('}')[0]
    expect(zeroBlock).toBeDefined()
    expect(zeroBlock).toContain("kind: 'notFound'")
    expect(zeroBlock).not.toContain('setCandidates')
  })

  it('mais de uma candidata nunca escolhe sozinha — guarda a lista, não abre medição nenhuma', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    const manyBlock = panel.split('if (items.length > 1) {')[1]?.split('}')[0]
    expect(manyBlock).toBeDefined()
    expect(manyBlock).toContain('setCandidates(items)')
    expect(manyBlock).not.toContain('openMeasurementForScannedBox')
  })

  it('a lista mora no bipe, não na fila — não reabre a escolha quando a fila recarrega por outro motivo', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain(
      'const [candidates, setCandidates] = useState<readonly PackageBox[] | null>(null)',
    )
  })

  /** Acima do teto a lista para de crescer — refinar a busca é mais rápido que rolar dezenas de linhas. */
  it('tem um teto de quantas candidatas mostra, com aviso do total quando passa dele', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('const MAX_CANDIDATES_SHOWN = 8')
    expect(panel).toContain('const shown = candidates.slice(0, MAX_CANDIDATES_SHOWN)')
    expect(panel).toContain('total > MAX_CANDIDATES_SHOWN')
    expect(panel).toContain("t('packageBoxes.scanner.candidates.overflow'")
  })

  /** Esc volta a ler, não fecha o leitor inteiro — só o botão de voltar/fechar do leitor faz isso. */
  it('Esc na lista volta a ler, e não fecha o leitor', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('useModalDialog({ isOpen: true, onClose: onBack })')
    expect(panel).toContain('onBack={() => setCandidates(null)}')
  })

  /** Foco no primeiro item, não no contêiner: quem chegou aqui vai tocar ou apertar Enter direto. */
  it('o foco entra na primeira candidata ao abrir a lista', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain("querySelector<HTMLElement>('[data-candidate] button')?.focus()")
  })

  /** Cada candidata é um botão do design system, largo o bastante para o alvo de toque de 44px. */
  it('cada candidata é um botão de toque grande, não uma linha de texto clicável', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('<Button')
    expect(panel).toContain('className={styles.candidateButton}')
    expect(panel).toContain('onClick={() => onSelect(box.id)}')

    const css = await Bun.file(
      new URL('../../src/modules/nfe-workspace/styles/packageBoxes.module.css', import.meta.url),
    ).text()
    expect(css).toContain('.candidateButton {')
    expect(css).toContain('min-height: var(--control-height);')
  })

  /** Situação não pode depender só de cor — a caixa já medida ganha texto próprio na candidata. */
  it('a caixa já medida diz isso em texto na candidata, não só numa cor', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain("t('packageBoxes.scanner.candidates.measured')")
    expect(panel).toContain('box.measuredAt === null ? null :')
  })
})

/**
 * ⚠️ Contrato por texto de fonte (spec do bipe físico): esta app não tem DOM nos testes, e a
 * pistola USB/Bluetooth que "digita" o código e manda Enter precisa cair no MESMO caminho de
 * `onScan`/`scanned` da câmera — nunca no filtro de texto simples do campo de busca.
 */
describe('o leitor físico (pistola) no campo de busca', () => {
  it('reconhece o formato de código: GTIN de 8/12/13/14 dígitos ou chave de acesso de 44', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('const SCANNED_CODE_LENGTHS = new Set([8, 12, 13, 14])')
    expect(panel).toContain('const ACCESS_KEY_PATTERN = /^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$/')
    expect(panel).toContain('function looksLikeScannedCode(value: string): boolean {')
  })

  it('Enter com código bipado manda pelo mesmo caminho de onScan da câmera', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    const searchField = panel.split('id="package-box-search"')[1]?.split('/>')[0]
    expect(searchField).toBeDefined()
    expect(searchField).toContain("if (event.key !== 'Enter') return")
    expect(searchField).toContain('if (!looksLikeScannedCode(value)) return')
    expect(searchField).toContain("scanOriginRef.current = 'keyboard'")
    expect(searchField).toContain('setAwaitingScan(true)')
    expect(searchField).toContain('onScan(value)')
  })

  /** Digitação comum (texto que não tem forma de código) segue filtrando a lista, como hoje. */
  it('Enter sem formato de código não dispara o caminho de scan', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    const onKeyDown = panel.split('onKeyDown={(event) => {')[1]?.split('}}')[0]
    expect(onKeyDown).toBeDefined()
    expect(onKeyDown).toContain('if (!looksLikeScannedCode(value)) return')
  })

  it('achar a caixa pela pistola marca a origem separada da câmera, e não abre câmera nenhuma', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain("if (scanOriginRef.current === 'keyboard') {")
    expect(panel).toContain('setCameFromKeyboardScan(true)')
  })

  /** Ao gravar uma medida aberta pela pistola, o foco volta ao campo de busca — nunca a câmera. */
  it('gravar uma medida aberta pela pistola devolve o foco ao campo de busca', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    const onMeasureBlock = panel
      .split('onMeasure={(measurement) => {')[1]
      ?.split('}}\n              onOpen=')[0]
    expect(onMeasureBlock).toBeDefined()
    expect(onMeasureBlock).toContain('if (cameFromKeyboardScan) {')
    expect(onMeasureBlock).toContain('setCameFromKeyboardScan(false)')
    expect(onMeasureBlock).toContain('searchInputRef.current?.focus()')
  })

  /** Digitar manualmente cancela o modo "veio da pistola", igual já cancela o modo câmera. */
  it('digitar no campo cancela os dois modos de retorno, câmera e pistola', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    const onChangeBlock = panel.split('onChange={(event) => {')[1]?.split('}}')[0]
    expect(onChangeBlock).toBeDefined()
    expect(onChangeBlock).toContain('setCameFromScan(false)')
    expect(onChangeBlock).toContain('setCameFromKeyboardScan(false)')
  })

  it('o campo tem placeholder curto convidando a buscar ou bipar', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain("placeholder={t('packageBoxes.searchPlaceholder')}")

    const ptLocale = await Bun.file(
      new URL('../../src/modules/nfe-workspace/locales/nfeWorkspace.locale.json', import.meta.url),
    ).text()
    expect(ptLocale).toContain('"searchPlaceholder": "Busque ou bipe a etiqueta"')

    const enLocale = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json',
        import.meta.url,
      ),
    ).text()
    expect(enLocale).toContain('"searchPlaceholder": "Search or scan the label"')
  })

  /** Nada de listener global: o Enter só é tratado no próprio campo de busca. */
  it('não existe listener global de teclado — só o onKeyDown do campo de busca', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).not.toContain("addEventListener('keydown'")
    expect(panel).not.toContain('window.addEventListener')
    expect(panel).not.toContain('document.addEventListener')
    /** Os dois `onKeyDown` que existem são de elemento: o campo de busca e o diálogo de candidatas. */
    const keydownOccurrences = panel.match(/onKeyDown=/g) ?? []
    expect(keydownOccurrences.length).toBe(2)
  })
})

describe('editar a medida de uma caixa já medida', () => {
  it('abre com o que está gravado, convertido de volta para centímetro', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()
    const form = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementForm.component.tsx',
        import.meta.url,
      ),
    ).text()

    /**
     * T14 item A5: era uma varredura de texto pela linha exata do `useState`. O que importa é a
     * regra, e ela agora é uma função pura: sem proposta, o campo abre com o que está gravado.
     */
    expect(
      initialDimensionCentimetres({ dimension: 'length', proposal: undefined, storedMm: 385 }),
    ).toBe('38,5')
    expect(
      initialDimensionCentimetres({ dimension: 'length', proposal: undefined, storedMm: null }),
    ).toBe('')
    expect(form).toContain('useState(() => String(unitsPerBox))')
    /** A linha remonta quando a medida muda: sem isso o estado inicial ficaria preso ao antigo. */
    expect(panel).toContain("key={`${box.id}:${box.measuredAt ?? 'sem-medida'}`}")
    /** E a medida aparece na linha, para conferir sem precisar abrir o formulário. */
    expect(panel).toContain("t('packageBoxes.measured'")
  })
})

/**
 * ⚠️ T10 (spec 152): o formulário digitado ganhou um segundo modo, aberto com a proposta da câmera
 * (`BoxDimensionMeasuredResult`, T8/T6). Sem DOM nesta app, o contrato lê a fonte de
 * `PackageBoxMeasurementForm.component.tsx` — mesmo padrão já usado para o painel.
 */
describe('selo experimental na tela de medida (D13, R8)', () => {
  it('a constante única decide o selo, e só ela muda na T16', async () => {
    const constant = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/shared/packageBoxMeasurement.constant.ts',
        import.meta.url,
      ),
    ).text()

    expect(CAMERA_MEASUREMENT_IS_EXPERIMENTAL).toBe(true)
    expect(constant).toContain('export const CAMERA_MEASUREMENT_IS_EXPERIMENTAL = true')
  })

  it('o selo só aparece com a proposta da câmera, é texto + ícone (nunca só cor)', async () => {
    const form = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementForm.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(form).toContain(
      'proposal === undefined || !CAMERA_MEASUREMENT_IS_EXPERIMENTAL ? null : (',
    )
    const badgeBlock = form.split('<Badge variant="secondary">')[1]?.split('</Badge>')[0]
    expect(badgeBlock).toBeDefined()
    expect(badgeBlock).toContain('<Icon name="alert" size="sm" />')
    expect(badgeBlock).toContain("t('packageBoxes.experimentalBadge')")
  })

  it('o texto do selo é o de D13, acentuado nos dois idiomas', async () => {
    const ptLocale = await Bun.file(
      new URL('../../src/modules/nfe-workspace/locales/nfeWorkspace.locale.json', import.meta.url),
    ).text()
    const enLocale = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json',
        import.meta.url,
      ),
    ).text()

    expect(ptLocale).toContain(
      '"experimentalHint": "A medida pela câmera é uma estimativa. Confira com a fita antes de gravar; na dúvida, digite."',
    )
    expect(enLocale).toContain('"experimentalBadge": "Experimental"')
  })

  it('cada motivo relatado pela câmera (D9) aparece traduzido junto do selo', async () => {
    const form = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementForm.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(form).toContain('t(`packageBoxes.warnings.${warning}`)')
  })
})

/**
 * R2: cada faixa de margem tem um comportamento próprio — confiável não avisa, imprecisa avisa e
 * pede confirmação explícita para gravar, e acima de 30 mm o campo nem vem preenchido.
 */
describe('margem por dimensão e aviso de imprecisão (R2)', () => {
  it('até 10 mm mostra só a margem, sem aviso', async () => {
    const form = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementForm.component.tsx',
        import.meta.url,
      ),
    ).text()

    const reliableBlock = form.split('<span className={styles.marginText}')[1]?.split('</span>')[0]
    expect(reliableBlock).toBeDefined()
    expect(reliableBlock).toContain("t('packageBoxes.margin'")
    expect(reliableBlock).not.toContain('role="alert"')
  })

  it('entre 10 e 30 mm avisa com texto, ícone e role=alert — nunca só cor', async () => {
    const form = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementForm.component.tsx',
        import.meta.url,
      ),
    ).text()

    const impreciseBlock = form
      .split('<span className={styles.marginWarning} role="alert">')[1]
      ?.split('</span>')[0]
    expect(impreciseBlock).toBeDefined()
    expect(impreciseBlock).toContain('<Icon name="alert" size="sm" />')
    expect(impreciseBlock).toContain("t('packageBoxes.imprecise'")
  })

  it('acima de 30 mm o campo fica vazio e o foco vai para ele', async () => {
    const form = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementForm.component.tsx',
        import.meta.url,
      ),
    ).text()

    /**
     * T14 itens A2/A5/M9, agora comportamento: a dimensão que a câmera não leu abre VAZIA (nunca
     * com a medida antiga da caixa, que nasceria preenchida e levaria a `400`), e o foco vai para a
     * PRIMEIRA delas, não para a última da lista.
     */
    const unreliableProposal = {
      engine: 'aruco-homography-v1',
      heightMarginMm: 42,
      heightMm: 0,
      lengthMarginMm: 42,
      lengthMm: 0,
      warnings: [],
      widthMarginMm: 4,
      widthMm: 250,
    } as const
    const noneEdited = { height: false, length: false, width: false } as const

    expect(
      initialDimensionCentimetres({
        dimension: 'height',
        proposal: unreliableProposal,
        storedMm: 999,
      }),
    ).toBe('')
    expect(
      initialDimensionCentimetres({
        dimension: 'width',
        proposal: unreliableProposal,
        storedMm: 999,
      }),
    ).toBe('25')
    expect(
      firstUnreliableDimension({
        edited: noneEdited,
        proposal: unreliableProposal,
        recorded: { height: null, length: null, width: 250 },
      }),
    ).toBe('length')

    expect(form).toContain('firstUnreliableRef.current?.focus()')
    expect(form).toContain(
      '{...(dimension === focusedDimension ? { inputRef: firstUnreliableRef } : {})}',
    )
    const unreliableBlock = form
      .split('<span className={styles.fieldError} role="alert">')[1]
      ?.split('</span>')[0]
    expect(unreliableBlock).toBeDefined()
    expect(unreliableBlock).toContain("t('packageBoxes.unreliable')")
  })

  it('imprecisa e não editada pede confirmação explícita antes de gravar — nada grava sem ela', async () => {
    const form = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementForm.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(form).toContain('if (requiresConfirmation) {')
    expect(form).toContain("setImpreciseChoice('confirming')")
    /** `handleSubmit` só chama `onSubmit` quando não precisa de confirmação. */
    const handleSubmitBlock = form.split('function handleSubmit(): void {')[1]?.split('}\n\n')[0]
    expect(handleSubmitBlock).toBeDefined()
    expect(handleSubmitBlock).toContain('return')

    expect(form).toContain("t('packageBoxes.impreciseConfirmTitle'")
    expect(form).toContain("t('packageBoxes.impreciseConfirmSave')")
    expect(form).toContain("t('packageBoxes.impreciseConfirmType')")
    /** As duas saídas do diálogo: "Gravar assim" chama `onConfirm`, "Digitar a medida" só fecha. */
    expect(form).toContain('onClick={onConfirm}')
    expect(form).toContain('onClick={onTypeInstead}')
  })
})

/**
 * R3/D17: editar um campo aberto pela câmera muda a origem para `camera_adjusted`, mas a proposta
 * original continua no bloco `camera` (o histórico compara as duas). Digitar continua o caminho
 * padrão, disponível mesmo sem proposta nenhuma.
 */
const CAMERA_PROPOSAL = {
  engine: 'aruco-homography-v1',
  heightMarginMm: 5,
  heightMm: 200,
  lengthMarginMm: 7,
  lengthMm: 300,
  warnings: [],
  widthMarginMm: 4,
  widthMm: 100,
} as const

const CAMERA_SUBMISSION_BASE: PackageBoxMeasurementSubmissionInput = {
  edited: { height: false, length: false, width: false },
  grossWeightGrams: null,
  heightMm: CAMERA_PROPOSAL.heightMm,
  impreciseConfirmed: false,
  lengthMm: CAMERA_PROPOSAL.lengthMm,
  proposal: CAMERA_PROPOSAL,
  unitsPerBox: 1,
  widthMm: CAMERA_PROPOSAL.widthMm,
}

describe('editar a proposta da câmera muda a origem (R3, D17)', () => {
  /**
   * ⚠️ Estes três deixaram de ser contrato por texto de fonte na 2ª revisão da T14: a montagem do
   * corpo saiu do componente para `packageBoxMeasurementSubmission.service`, justamente para o
   * contrato de fronteira poder passar o corpo real pelo schema real da API
   * (`package-box-submission-boundary.contract.ts`). Com a função pura na mão, o comportamento se
   * mede direto — a fonte deixou de ser a única testemunha.
   */
  it('sem proposta a origem é sempre typed, sem bloco camera', () => {
    const submission = buildPackageBoxMeasurementSubmission({
      edited: { height: false, length: false, width: false },
      grossWeightGrams: null,
      heightMm: 200,
      impreciseConfirmed: false,
      lengthMm: 300,
      proposal: undefined,
      unitsPerBox: 1,
      widthMm: 100,
    })

    expect(submission.source).toBe('typed')
    expect(submission.camera).toBeUndefined()
  })

  it('editar um campo marca a dimensão como editada, e isso sai da origem final', async () => {
    const form = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementForm.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(form).toContain('setEdited((current) => ({ ...current, [dimension]: true }))')
    expect(
      buildPackageBoxMeasurementSubmission({
        ...CAMERA_SUBMISSION_BASE,
        edited: { height: false, length: true, width: false },
      }).source,
    ).toBe('camera_adjusted')
    expect(buildPackageBoxMeasurementSubmission(CAMERA_SUBMISSION_BASE).source).toBe('camera')
  })

  it('a margem da proposta continua no bloco camera mesmo quando a dimensão foi editada (D17)', () => {
    /**
     * A margem pertence à proposta da câmera, não ao valor final (decisão de 2026-09-16, T12): editar
     * um campo não apaga a margem enviada, senão o protocolo de validação (D16, "digite a fita em
     * todos os campos") apagaria a margem de quase toda leitura da sessão real.
     */
    const submission = buildPackageBoxMeasurementSubmission({
      ...CAMERA_SUBMISSION_BASE,
      edited: { height: true, length: true, width: true },
      heightMm: 210,
      lengthMm: 310,
      widthMm: 110,
    })

    expect(submission.camera?.heightMarginMm).toBe(CAMERA_PROPOSAL.heightMarginMm)
    expect(submission.camera?.lengthMarginMm).toBe(CAMERA_PROPOSAL.lengthMarginMm)
    expect(submission.camera?.widthMarginMm).toBe(CAMERA_PROPOSAL.widthMarginMm)
    /** Proposto (D17) continua indo para o histórico mesmo quando o campo foi editado por cima. */
    expect(submission.camera?.proposedLengthMm).toBe(CAMERA_PROPOSAL.lengthMm)
  })

  it('"Digitar medida" continua disponível — o formulário nunca exige a câmera', async () => {
    const form = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementForm.component.tsx',
        import.meta.url,
      ),
    ).text()

    /** `proposal` é opcional na assinatura — o mesmo componente atende o caminho 100% digitado. */
    expect(form).toContain('proposal: BoxDimensionMeasuredResult | undefined')
  })
})

/**
 * R5: a API grava origem e margem por auditoria — o cliente manda `source`/`camera`, e a leitura
 * (`GET /nfe-package-boxes`) devolve `measurementSource`/`measurementMarginMm` por caixa.
 */
describe('origem e margem gravadas para auditoria (R5)', () => {
  it('o PUT manda source e o bloco camera quando a medida veio da câmera', async () => {
    const captured: { init?: RequestInit; url?: string } = {}
    await buildClient({ data: BOX }, captured).measureBox({
      camera: {
        engine: 'aruco-homography-v1',
        heightMarginMm: 4,
        impreciseConfirmed: true,
        lengthMarginMm: 18,
        proposedHeightMm: 200,
        proposedLengthMm: 400,
        proposedWidthMm: 300,
        warnings: ['lowLight'],
        widthMarginMm: 6,
      },
      grossWeightGrams: null,
      heightMm: 200,
      id: BOX.id,
      lengthMm: 400,
      source: 'camera',
      unitsPerBox: 1,
      widthMm: 300,
    })

    const body = JSON.parse(captured.init?.body as string) as Record<string, unknown>
    expect(body.source).toBe('camera')
    expect(body.camera).toEqual({
      engine: 'aruco-homography-v1',
      heightMarginMm: 4,
      impreciseConfirmed: true,
      lengthMarginMm: 18,
      proposedHeightMm: 200,
      proposedLengthMm: 400,
      proposedWidthMm: 300,
      warnings: ['lowLight'],
      widthMarginMm: 6,
    })
  })

  /** Corpo antigo, sem `source`/`camera`, continua válido — o cliente não os inventa. */
  it('sem source nem camera o corpo continua igual ao de hoje (retrocompatível)', async () => {
    const captured: { init?: RequestInit; url?: string } = {}
    await buildClient({ data: BOX }, captured).measureBox({
      grossWeightGrams: null,
      heightMm: 200,
      id: BOX.id,
      lengthMm: 400,
      unitsPerBox: 1,
      widthMm: 300,
    })

    const body = JSON.parse(captured.init?.body as string) as Record<string, unknown>
    expect(body.source).toBeUndefined()
    expect(body.camera).toBeUndefined()
    expect(Object.keys(body).sort()).toEqual([
      'grossWeightGrams',
      'heightMm',
      'lengthMm',
      'unitsPerBox',
      'widthMm',
    ])
  })

  it('a leitura da fila aceita measurementSource e measurementMarginMm por caixa', () => {
    const queue = packageBoxQueueFromApi({
      data: {
        coveredCount: 1,
        items: [{ ...BOX, measurementMarginMm: 18, measurementSource: 'camera_adjusted' }],
        totalVolumes: 100,
      },
    })

    expect(queue.items[0]?.measurementSource).toBe('camera_adjusted')
    expect(queue.items[0]?.measurementMarginMm).toBe(18)
  })

  /**
   * ⚠️ T14 item ALTO-2 (4ª revisão): `measurementMarginMm: null` pela câmera não é margem zero — é
   * o protocolo D16 gravando que as três dimensões foram digitadas por cima (nenhuma proposta sobrou
   * para render). A fila lia "Pela câmera, ±0 cm" bem na caixa em que a câmera errou nas três,
   * anunciando confiança que não existe.
   *
   * ⚠️ MÉDIO-B (T14, 5ª revisão): a versão anterior varria o texto-fonte do painel com igualdade
   * exata de formatação — falso-positivo esperando o próximo `format`, e não provava a renderização.
   * `measurementSourceLabel` saiu para módulo próprio (`packageBoxMeasurementLabel.ts`) e é testada
   * aqui como função pura, com um `t` de mentira, cobrindo as quatro origens possíveis.
   */
  it('cada origem tem o rótulo certo, e a margem nula pela câmera nunca vira "±0 cm" (ALTO-2)', async () => {
    const fakeT = (key: string, options?: Record<string, unknown>): string =>
      options === undefined ? key : `${key}:${JSON.stringify(options)}`

    expect(
      measurementSourceLabel(fakeT, { measurementMarginMm: null, measurementSource: 'typed' }),
    ).toBe('packageBoxes.source.typed')
    expect(
      measurementSourceLabel(fakeT, { measurementMarginMm: 40, measurementSource: 'camera' }),
    ).toBe('packageBoxes.source.camera:{"margin":4}')
    expect(
      measurementSourceLabel(fakeT, {
        measurementMarginMm: 18,
        measurementSource: 'camera_adjusted',
      }),
    ).toBe('packageBoxes.source.camera:{"margin":1.8}')
    expect(
      measurementSourceLabel(fakeT, {
        measurementMarginMm: null,
        measurementSource: 'camera_adjusted',
      }),
    ).toBe('packageBoxes.source.cameraNoMargin')
    expect(
      measurementSourceLabel(fakeT, { measurementMarginMm: null, measurementSource: null }),
    ).toBe('packageBoxes.source.unknown')

    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()
    expect(panel).not.toContain('box.measurementMarginMm === null ? 0 :')

    const ptLocale = await Bun.file(
      new URL('../../src/modules/nfe-workspace/locales/nfeWorkspace.locale.json', import.meta.url),
    ).text()
    const enLocale = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json',
        import.meta.url,
      ),
    ).text()
    expect(ptLocale).toContain('"cameraNoMargin": "Pela câmera, sem margem registrada"')
    expect(enLocale).toContain('"cameraNoMargin": "By camera, no margin recorded"')
  })

  it('origem fora do domínio fechado é recusada, não silenciada', () => {
    expect(() =>
      packageBoxQueueFromApi({
        data: {
          coveredCount: 1,
          items: [{ ...BOX, measurementSource: 'invented' }],
          totalVolumes: 100,
        },
      }),
    ).toThrow()
  })
})
