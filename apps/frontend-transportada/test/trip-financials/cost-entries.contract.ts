/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { maskTypedAmount, TYPED_MONEY_SCALE } from '@/modules/shared/decimalAmount.service'
import tripFinancials from '../../src/modules/trip-financials/locales/tripFinancials.locale.json'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const FORM_SERVICE = 'src/modules/trip-financials/shared/tripCostEntryForm.service.ts'
const QUERY_KEY_CONSTANT = 'src/modules/trip-financials/shared/tripFinancialsQueryKey.constant.ts'
const ENTRIES_HOOK = 'src/modules/trip-financials/hooks/useTripCostEntries.hook.ts'
const FINANCIALS_HOOK = 'src/modules/trip-financials/hooks/useTripFinancials.hook.ts'
const PREVIEW_HOOK = 'src/modules/trip-financials/hooks/useTripValuationPreview.hook.ts'
const RESULTS_PAGE = 'src/modules/trip-financials/pages/FinancialResultsWorkspace.page.tsx'
const ENTRIES_COMPONENT = 'src/modules/trip-financials/components/TripCostEntries.component.tsx'
const FORM_COMPONENT = 'src/modules/trip-financials/components/TripCostEntryForm.component.tsx'
const PANEL = 'src/modules/trip-financials/components/TripFinancialPanel.component.tsx'
const PAGE = 'src/modules/trip/pages/TripDetail.page.tsx'

function readSource(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/**
 * O serviço puro e a validação nascem com esta suíte, e um `import` estático deles no topo derrubaria
 * o arquivo inteiro antes de qualquer asserção rodar — o vermelho que interessa é o de conteúdo.
 */
function loadFormService() {
  return import('@/modules/trip-financials/shared/tripCostEntryForm.service')
}

function loadResponseValidation() {
  return import('@/modules/trip-financials/shared/tripCostEntryResponse.validation')
}

/**
 * Spec 143 aceite 9: **a viagem aberta mostra a conta inteira, o que já foi lançado e por quem, e
 * deixa lançar.** A lista é a metade `trip.financials` e o formulário é a metade `trip.manage` — a
 * fronteira do arquivo é a fronteira da permissão.
 */
describe('o valor digitado vira o decimal que a API aceita (spec 143 D6)', () => {
  /**
   * ⚠️ A vírgula é um 400 esperando acontecer: o campo digita `1.234,56` e o `AMOUNT_PATTERN` da
   * API só aceita `1234.5600`. Um `replace(',', '.')` à mão produziria `1.234.56`, que ela recusa.
   */
  test('o milhar sai e a vírgula vira ponto, na escala fiscal', async () => {
    const { toTripCostEntryBody } = await loadFormService()

    expect(
      toTripCostEntryBody({ amount: '1.234,56', description: 'Pedágio', entryKindId: 'e1' }).amount,
    ).toBe('1234.5600')
  })

  test('o corpo leva a espécie e a descrição escolhidas', async () => {
    const { toTripCostEntryBody } = await loadFormService()

    expect(
      toTripCostEntryBody({ amount: '80,00', description: 'Chaveiro', entryKindId: 'e2' }),
    ).toEqual({ amount: '80.0000', description: 'Chaveiro', entryKindId: 'e2' })
  })
})

describe('as regras do formulário, contra o serviço puro', () => {
  test('campo de valor em branco não sai do formulário', async () => {
    const { validateTripCostEntryForm } = await loadFormService()

    expect(validateTripCostEntryForm({ amount: '', description: '', entryKindId: 'e1' })).toEqual([
      'amountRequired',
    ])
  })

  /**
   * ⚠️ Zero passa no padrão da API e morre no `CHECK ("amount" > 0)` do banco — o operador tomaria
   * 500 onde o contrato promete 400. O `refine` da API fecha o buraco; aqui ele nem chega a sair.
   */
  test('zero não é custo, e nem sai do formulário', async () => {
    const { validateTripCostEntryForm } = await loadFormService()

    expect(
      validateTripCostEntryForm({ amount: '0,00', description: '', entryKindId: 'e1' }),
    ).toEqual(['amountRequired'])
  })

  /** RF5: espécie é obrigatória — sem escolha, o servidor recusaria o lançamento. */
  test('sem espécie escolhida não sai do formulário', async () => {
    const { validateTripCostEntryForm } = await loadFormService()

    expect(
      validateTripCostEntryForm({ amount: '80,00', description: '', entryKindId: '' }),
    ).toEqual(['entryKindRequired'])
  })

  /** 200 é o teto do servidor; 200 caracteres soltos numa linha de lista destroem o painel. */
  test('a descrição respeita o teto que o servidor cobra', async () => {
    const { TRIP_COST_ENTRY_DESCRIPTION_MAX_LENGTH, validateTripCostEntryForm } =
      await loadFormService()

    expect(TRIP_COST_ENTRY_DESCRIPTION_MAX_LENGTH).toBe(200)
    expect(
      validateTripCostEntryForm({
        amount: '80,00',
        description: 'x'.repeat(TRIP_COST_ENTRY_DESCRIPTION_MAX_LENGTH + 1),
        entryKindId: 'e2',
      }),
    ).toEqual(['descriptionTooLong'])
  })

  test('lançamento completo não tem nada a corrigir', async () => {
    const { validateTripCostEntryForm } = await loadFormService()

    expect(
      validateTripCostEntryForm({ amount: '80,00', description: 'Chaveiro', entryKindId: 'e2' }),
    ).toEqual([])
  })

  /**
   * ⚠️ Cópia por valor do `AMOUNT_PATTERN` de `trip-financial.schema.ts`: o bundle não carrega
   * código da API, e o campo que passasse aqui e falhasse lá viraria 400 sem explicação na tela.
   */
  test('valor acima do que a API aceita é barrado antes do envio', async () => {
    const { validateTripCostEntryForm } = await loadFormService()

    expect(
      validateTripCostEntryForm({
        amount: '99.999.999.999.999,00',
        description: '',
        entryKindId: 'e1',
      }),
    ).toEqual(['amountInvalid'])
  })
})

describe('a resposta da API é entrada não confiável', () => {
  test('o lançamento chega com autor, valor em texto e momento', async () => {
    const { toTripCostEntries } = await loadResponseValidation()

    expect(
      toTripCostEntries({
        data: [
          {
            actor: { name: 'Ana Souza', userId: '00000000-0000-4000-8000-000000000001' },
            amount: '44.6000',
            createdAt: '2026-08-05T09:00:00.000Z',
            description: 'Pedágio da BR-101',
            id: '00000000-0000-4000-8000-000000000e01',
            kind: 'toll',
          },
        ],
      }),
    ).toEqual([
      {
        actor: { name: 'Ana Souza', userId: '00000000-0000-4000-8000-000000000001' },
        amount: '44.6000',
        createdAt: '2026-08-05T09:00:00.000Z',
        description: 'Pedágio da BR-101',
        entryKind: null,
        id: '00000000-0000-4000-8000-000000000e01',
        kind: 'toll',
      },
    ])
  })

  /** Valor é **texto** do começo ao fim: convertê-lo aqui perderia centavo na soma da tela. */
  test('valor numérico na resposta é resposta inválida', async () => {
    const { toTripCostEntries, TripCostEntryResponseError } = await loadResponseValidation()

    expect(() =>
      toTripCostEntries({
        data: [
          {
            actor: { name: '', userId: '' },
            amount: 44.6,
            createdAt: '2026-08-05T09:00:00.000Z',
            description: '',
            id: '00000000-0000-4000-8000-000000000e01',
            kind: 'toll',
          },
        ],
      }),
    ).toThrow(TripCostEntryResponseError)
  })

  /**
   * O nome pode não existir (cadeia nome → e-mail → usuário removido, D6): o vazio chega intacto e
   * quem escolhe a palavra é o locale, nunca o validador.
   */
  test('autor sem nome chega vazio, para o locale decidir a palavra', async () => {
    const { toTripCostEntries } = await loadResponseValidation()

    const [entry] = toTripCostEntries({
      data: [
        {
          actor: { name: '', userId: '' },
          amount: '80.0000',
          createdAt: '2026-08-05T09:00:00.000Z',
          description: '',
          id: '00000000-0000-4000-8000-000000000e02',
          kind: 'other',
        },
      ],
    })

    expect(entry?.actor.name).toBe('')
    expect(tripFinancials.costEntries.unknownActor).not.toBe('')
  })

  /**
   * ⚠️ O `as` não valida nada. Espécie nova do servidor entrava na lista como conhecida e caía num
   * `t('costEntries.kinds.<espécie>')` sem chave — a tela imprimiria a chave crua na linha do gasto.
   */
  test('espécie que a tela não sabe nomear é resposta inválida', async () => {
    const { toTripCostEntries, TripCostEntryResponseError } = await loadResponseValidation()

    expect(() =>
      toTripCostEntries({
        data: [
          {
            actor: { name: '', userId: '' },
            amount: '44.6000',
            createdAt: '2026-08-05T09:00:00.000Z',
            description: '',
            id: '00000000-0000-4000-8000-000000000e03',
            kind: 'fine',
          },
        ],
      }),
    ).toThrow(TripCostEntryResponseError)
  })

  test('o guardião da espécie conhece as duas do catálogo e recusa o resto', async () => {
    const { TRIP_COST_ENTRY_KINDS, isTripCostEntryKind } = await import(
      '@/modules/trip-financials/shared/tripFinancials.types'
    )

    for (const kind of TRIP_COST_ENTRY_KINDS) expect(isTripCostEntryKind(kind)).toBe(true)
    for (const unknown of ['fine', 'manual', 'Toll', ''])
      expect(isTripCostEntryKind(unknown)).toBe(false)
  })

  /** O seletor nasce do mesmo catálogo: espécie nova viraria opção na tela e pedágio no envio. */
  /** Spec 169 RF5: o seletor migrou do enum fixo para o cadastro de espécies (entryKindId). */
  test('o formulário lê a espécie do cadastro, não de um enum fixo', async () => {
    const source = await readSource(FORM_COMPONENT)

    expect(source).not.toContain("value === 'other' ? 'other' : 'toll'")
    expect(source).toContain('entryKindId')
    expect(source).toContain('entryKinds.map(')
  })
})

describe('as chaves de consulta do módulo moram num lugar só', () => {
  test('a constante publica as três chaves, e o hook antigo passa a lê-las de lá', async () => {
    const [constant, hook] = await Promise.all([
      readSource(QUERY_KEY_CONSTANT),
      readSource(FINANCIALS_HOOK),
    ])

    expect(constant).toContain('TRIP_COST_ENTRIES_QUERY_KEY')
    expect(constant).toContain('TRIP_FINANCIALS_QUERY_KEY')
    expect(constant).toContain('TRIP_VALUATION_QUERY_KEY')
    expect(hook).toContain("from '../shared/tripFinancialsQueryKey.constant'")
    expect(hook).not.toMatch(/const TRIP_FINANCIALS_QUERY_KEY = /u)
  })
})

describe('a permissão de leitura também mora num lugar só', () => {
  /**
   * ⚠️ Permissão redigitada é a pior das strings repetidas: errar uma letra não quebra nada, só
   * fecha a tela para quem tinha direito — ou abre para quem não tinha, no sentido contrário.
   */
  test('nem o hook da prévia nem a página dos resultados redigitam a string', async () => {
    const [constant, preview, page] = await Promise.all([
      readSource(QUERY_KEY_CONSTANT),
      readSource(PREVIEW_HOOK),
      readSource(RESULTS_PAGE),
    ])

    expect(constant).toContain("FINANCIALS_PERMISSION = 'trip.financials'")
    expect(preview).toContain('FINANCIALS_PERMISSION')
    expect(preview).not.toMatch(/const FINANCIALS_PERMISSION = /u)
    expect(page).toContain('FINANCIALS_PERMISSION')
    expect(page).not.toContain("'trip.financials'")
  })
})

describe('o hook dos lançamentos', () => {
  test('não pergunta a quem não tem trip.financials', async () => {
    const [hook, constant] = await Promise.all([
      readSource(ENTRIES_HOOK),
      readSource(QUERY_KEY_CONSTANT),
    ])

    expect(constant).toContain("export const FINANCIALS_PERMISSION = 'trip.financials'")
    expect(hook).toContain('FINANCIALS_PERMISSION')
    expect(hook).toContain('enabled:')
  })

  /**
   * Lançar move a lista e move a conta prevista. **Não move o congelado**: custo lançado não muda
   * resultado já fechado, e invalidar `trip-financials` buscaria payload idêntico sugerindo o
   * contrário.
   */
  test('o sucesso derruba a lista e a conta prevista, e não o congelado', async () => {
    const hook = await readSource(ENTRIES_HOOK)

    expect(hook).toContain('TRIP_COST_ENTRIES_QUERY_KEY')
    expect(hook).toContain('TRIP_VALUATION_QUERY_KEY')
    expect(hook).not.toContain('TRIP_FINANCIALS_QUERY_KEY')
  })

  /** `isPending` só cai quando o trabalho acaba: aguardar o cache prenderia o botão depois disso. */
  test('a revalidação não segura o botão', async () => {
    const hook = await readSource(ENTRIES_HOOK)

    expect(hook).toContain('onSuccess: () => {')
    expect(hook).not.toMatch(/onSuccess:\s*async\b/u)
  })

  /** ⚠️ O nome do autor é PII: ele aparece na tela e **nunca** em log nem telemetria. */
  test('o nome de quem lançou não vai para o console', async () => {
    const sources = await Promise.all([
      readSource(ENTRIES_HOOK),
      readSource(ENTRIES_COMPONENT),
      readSource(FORM_COMPONENT),
    ])

    for (const source of sources) expect(source).not.toContain('console.')
  })
})

describe('a lista de lançamentos na tela', () => {
  /**
   * ⚠️ A falha da lista não pode apagar o painel: o ramo de erro do painel devolve só a caixa de
   * erro e o ledger some. A lista tem bandeira e nova tentativa próprias, com texto próprio.
   */
  test('a falha da lista tem erro e nova tentativa só dela', async () => {
    const component = await readSource(ENTRIES_COMPONENT)

    expect(component).toContain("t('costEntries.error')")
    expect(component).toContain("t('costEntries.retry')")
    expect(tripFinancials.costEntries.error).not.toBe(tripFinancials.panel.error)
  })

  /** Vazio não é erro, e também não é "ninguém lançou" da parcela — que quer dizer outra coisa. */
  test('a lista vazia se explica com palavra própria', async () => {
    const component = await readSource(ENTRIES_COMPONENT)

    expect(component).toContain("t('costEntries.empty')")
    expect(tripFinancials.costEntries.empty).not.toBe(tripFinancials.costEntries.error)
    expect(tripFinancials.costEntries.empty).not.toBe(tripFinancials.gap.NOT_RECORDED)
  })

  /** Carregando é esqueleto no formato da lista: texto solto ou `null` já foi proibido. */
  test('o carregamento tem a forma da lista', async () => {
    const component = await readSource(ENTRIES_COMPONENT)

    expect(component).toContain('SkeletonGroup')
    expect(component).toContain('Skeleton')
  })

  /**
   * ⚠️ A T8 devolve `createdAt` desc e o ledger ordena por peso. Duas ordens num painel tudo bem;
   * um segundo `sort` aqui é a divergência calada que este módulo já avisou duas vezes.
   */
  test('a lista não reordena o que a API ordenou', async () => {
    const component = await readSource(ENTRIES_COMPONENT)

    expect(component).not.toContain('.sort(')
  })
})

describe('o formulário, que é a metade trip.manage', () => {
  /** Sem `trip.manage` não há formulário — não é campo desabilitado, e não é aviso de permissão. */
  test('o formulário só é montado por quem pode lançar', async () => {
    const component = await readSource(ENTRIES_COMPONENT)

    expect(component).toContain('canRecord ?')
    expect(component).toContain('<TripCostEntryForm')
  })

  /**
   * ⚠️ Limpar o campo depois de um 400 é como o mesmo custo entra duas vezes — e editar ou apagar
   * lançamento está fora do escopo, então não há como desfazer a duplicata.
   */
  test('a falha da mutação preserva o que foi digitado', async () => {
    const component = await readSource(FORM_COMPONENT)

    expect(component).toMatch(
      /await onRecord\([\s\S]{0,160}setFields\(EMPTY_TRIP_COST_ENTRY_FORM\)/u,
    )
    expect(component).not.toMatch(/catch[\s\S]{0,120}setFields\(/u)
  })

  /** O par da casa: máscara na digitação, parser na fronteira. Nada de `replace(',', '.')` à mão. */
  test('o campo de valor usa o par de máscara e parser do repositório', async () => {
    const [component, service] = await Promise.all([
      readSource(FORM_COMPONENT),
      readSource(FORM_SERVICE),
    ])

    expect(component).toContain('maskTypedAmount')
    expect(service).toContain('parseTypedAmount')
    expect(service).toContain('AMOUNT_MAX_SCALE')
    expect(service).not.toContain("replace(',', '.')")
    expect(service).not.toContain('Number(')
  })
})

describe('o painel monta a lista nas duas situações da viagem', () => {
  /**
   * ⚠️ O ledger já é o da viagem aberta e continua exatamente como está — uma segunda
   * implementação da mesma conta diverge calada. A lista entra **depois** dele, irmã no painel.
   */
  test('o ledger compartilhado não ganha prop nem variante', async () => {
    const panel = await readSource(PANEL)

    expect(panel).toContain('<ValuationLedger')
    expect(panel).toContain('valuation={valuation}')
  })

  /**
   * Viagem aberta e viagem fechada mostram o que foi lançado: os dois ramos montam
   * `LaunchedEntries` (spec 169 RF11 — extraído para caber no teto e nascer antes do total),
   * que por sua vez monta `TripCostEntries` uma vez só.
   */
  test('os dois ramos do painel montam os lançamentos', async () => {
    const panel = await readSource(PANEL)

    expect(panel.match(/<LaunchedEntries\b/gu)?.length).toBe(2)
    expect(panel.match(/<TripCostEntries\b/gu)?.length).toBe(1)
  })

  /** Teto de 200 linhas: a tabela do congelado sai para arquivo próprio em vez de inchar o painel. */
  test('o painel cabe no teto do repositório', async () => {
    const panel = await readSource(PANEL)

    expect(panel.split('\n').length).toBeLessThanOrEqual(200)
  })
})

describe('as duas direções da permissão, pela página', () => {
  /**
   * ⚠️ `trip.manage` sem `trip.financials` **não vê nem o que ele mesmo lançou** — é a assimetria
   * proposital da rota. Expor a lista ou o formulário fora do painel vazaria o valor que
   * `trip.financials` protege.
   */
  test('lista e formulário vivem dentro do painel, nunca ao lado dele', async () => {
    const page = await readSource(PAGE)

    expect(page).toContain('useTripCostEntries')
    expect(page).toContain('costEntries={costEntries}')
    expect(page).not.toContain('<TripCostEntries')
    expect(page).not.toContain('<TripCostEntryForm')
  })
})

/**
 * ⚠️ Pegado pelo usuário na bancada, 23/09: o campo "Valor" do lançamento avulso mostrava
 * **`100,0000`** — quatro casas num campo de dinheiro. A máscara usava `AMOUNT_MAX_SCALE`, que é a
 * escala de **armazenamento** (a API guarda quatro casas para não perder centavo em conta
 * intermediária), não a de digitação. Quem lança R$ 100 digita "10000" e vê "100,00", como em toda
 * outra tela de dinheiro do produto — a ficha do veículo já fazia assim.
 */
describe('escala do campo de dinheiro do lançamento avulso (defeito medido em 23/09)', () => {
  test('o formulário digita com duas casas, como o resto do produto', async () => {
    const component = await readSource(FORM_COMPONENT)

    expect(component).toContain('TYPED_MONEY_SCALE')
    expect(component).not.toContain('scale: AMOUNT_MAX_SCALE')
  })

  test('a máscara com duas casas produz o valor que o operador espera', () => {
    expect(maskTypedAmount({ scale: TYPED_MONEY_SCALE, value: '10000' })).toBe('100,00')
    expect(maskTypedAmount({ scale: TYPED_MONEY_SCALE, value: '1' })).toBe('0,01')
    expect(maskTypedAmount({ scale: TYPED_MONEY_SCALE, value: '' })).toBe('')
  })
})
