/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createBillingRoutes } from '../src/billing/presentation/billing.routes'
import { createBusinessCalendarSettingsRoutes } from '../src/business-calendar/presentation/business-calendar-settings.routes'
import { createMunicipalHolidayRoutes } from '../src/business-calendar/presentation/municipal-holiday.routes'
import { createMunicipalHolidayRuleRoutes } from '../src/business-calendar/presentation/municipal-holiday-rule.routes'
import { createStateHolidayRoutes } from '../src/business-calendar/presentation/state-holiday.routes'
import { createCargoArrivalDocumentProductsRoute } from '../src/cargo-receiving/presentation/cargo-arrival-document-products.routes'
import { createCargoArrivalOccurrenceRoutes } from '../src/cargo-receiving/presentation/cargo-arrival-occurrence.routes'
import { createCargoArrivalSeparationRoutes } from '../src/cargo-receiving/presentation/cargo-arrival-separation.routes'
import { createCargoArrivalRoutes } from '../src/cargo-receiving/presentation/cargo-arrival.routes'
import { createCargoPreviewActionRoutes } from '../src/cargo-receiving/presentation/cargo-preview-action.routes'
import { createCargoPreviewTripDraftRoutes } from '../src/cargo-receiving/presentation/cargo-preview-trip-draft.routes'
import { createCargoPreviewRoutes } from '../src/cargo-receiving/presentation/cargo-preview.routes'
import { createContractorPreviewEmailRoutes } from '../src/cargo-receiving/presentation/contractor-preview-email.routes'
import { createCteIssuanceRoutes } from '../src/cte-issuance/presentation/cte-issuance.routes'
import { createCompanyCrewSettingsRoutes } from '../src/fleet/presentation/crew-settings.routes'
import { createFleetRoutes } from '../src/fleet/presentation/fleet.routes'
import { AuthorizationService } from '../src/identity/application/authorization.service'
import { resolveCompanyPermissions } from '../src/identity/domain/authorization.policy'
import type { AuthenticatedContext, CompanyContext } from '../src/identity/domain/tenant-context'
import { createNfeDocumentRoutes } from '../src/nfe-documents/presentation/nfe-documents.routes'
import { createOccurrenceConversationRoutes } from '../src/occurrence-conversation/presentation/occurrence-conversation.routes'
import { createQuickReplyRoutes } from '../src/occurrence-conversation/presentation/quick-replies.routes'
import { createOccurrenceConversationUnassignedRoutes } from '../src/occurrence-conversation/presentation/occurrence-conversation-unassigned.routes'
import { createPackageBoxMeasurementExportRoutes } from '../src/nfe-documents/presentation/package-box-measurement-export.routes'
import { createPackageBoxRoutes } from '../src/nfe-documents/presentation/package-box.routes'
import { createPendingItemsRoutes } from '../src/pending-items/presentation/pending-items.routes'
import { createTripDocumentReviewRoutes } from '../src/trips/presentation/trip-document-review.routes'
import {
  createTripFieldOfficeRoutes,
  OFFICE_REPORT_POLICY,
} from '../src/trips/presentation/trip-field-office.routes'
import { createTripFieldOfficeOccurrenceRoutes } from '../src/trips/presentation/trip-field-office-occurrence.routes'
import { createTripDocumentReportRoutes } from '../src/trips/presentation/trip-document-report.routes'
import { createTripRoutes } from '../src/trips/presentation/trip.routes'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000003'

/**
 * A rota é montada com dependência falsa só para ler a política dela: o `separator` recusado numa
 * lista de nomes de permissão não prova nada — o que decide o `403` é o par rota→política.
 */
function unusedDependencies(): unknown {
  const handler: ProxyHandler<() => unknown> = {
    apply: () => unusedDependencies(),
    get: () => unusedDependencies(),
  }
  return new Proxy(() => unusedDependencies(), handler)
}

function companyContext(roles: CompanyContext['roles']): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: '00000000-0000-4000-8000-000000000004',
      issuer: 'https://issuer.test',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'separator',
      userId: USER_ID,
    },
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: MEMBERSHIP_ID,
      permissions: resolveCompanyPermissions(roles),
      roles,
      userId: USER_ID,
    },
  }
}

function reachableRoutes(roles: CompanyContext['roles']): readonly string[] {
  const service = new AuthorizationService()
  const context = companyContext(roles)
  const dependencies = unusedDependencies() as never
  const routes = [
    ...createTripRoutes(dependencies),
    ...createFleetRoutes(dependencies),
    ...createCompanyCrewSettingsRoutes(dependencies),
    ...createBillingRoutes(dependencies),
    ...createCteIssuanceRoutes(dependencies),
    ...createNfeDocumentRoutes(dependencies),
    ...createPackageBoxRoutes(dependencies),
    ...createPackageBoxMeasurementExportRoutes(dependencies),
    ...createPendingItemsRoutes(dependencies),
    ...createTripDocumentReviewRoutes(dependencies),
    ...createTripDocumentReportRoutes(dependencies),
    // Spec 156 T8b (revisão do code-reviewer): as rotas do escritório com autoria precisam entrar
    // aqui para a lista exaustiva **provar** a ausência delas — sem elas no array, o separador
    // "não alcançar" field-delivery/field-return era verdade por elas nunca terem sido testadas,
    // não porque a permissão as barrasse.
    ...createTripFieldOfficeRoutes(dependencies),
    ...createTripFieldOfficeOccurrenceRoutes(dependencies),
    // Spec 183 T404 (143 T016): o separador lê a conversa (`fleet.read`, como a listagem) e marca
    // como lida, mas **não** escreve à contratante nem vê a prévia (`occurrences.resolve`).
    ...createOccurrenceConversationRoutes(dependencies),
    ...createOccurrenceConversationUnassignedRoutes(dependencies),
    // Spec 183 T701 (RF12): as respostas rápidas são cadastro (`settings.manage`) e leitura de quem
    // escreve na conversa (`occurrences.resolve`) — o separador não alcança nenhuma das duas.
    ...createQuickReplyRoutes(dependencies),
    // Spec 238 T1.3: o calendário de dias úteis. Regra, feriado estadual e sábado são configuração
    // (`settings.manage`, ler e escrever); só o `GET /municipal-holidays` é `fleet.read`, desde a spec 060.
    ...createMunicipalHolidayRoutes(dependencies),
    ...createMunicipalHolidayRuleRoutes(dependencies),
    ...createStateHolidayRoutes(dependencies),
    ...createBusinessCalendarSettingsRoutes(dependencies),
    // Spec 237 T2.3 (ADR-0094 §6): a chegada e a primeira separação são do separador — ele confere
    // e separa no celular. Lê com `fleet.read` e escreve com `trip.manage`, as que já tinha.
    ...createCargoArrivalRoutes(dependencies),
    ...createCargoArrivalSeparationRoutes(dependencies),
    ...createCargoArrivalOccurrenceRoutes(dependencies),
    createCargoArrivalDocumentProductsRoute(dependencies),
    // Spec 237 T4.2: a prévia vira a chegada (RF5b), e quem confere a chegada é o separador — ele
    // envia a planilha e decide o vínculo com as mesmas `fleet.read`/`trip.manage`.
    ...createCargoPreviewRoutes(dependencies),
    ...createCargoPreviewActionRoutes(dependencies),
    ...createCargoPreviewTripDraftRoutes(dependencies),
    // Spec 237 T4.6b: a entrada da prévia por e-mail é configuração (`settings.manage`, ler e escrever): o
    // separador lê a frota (`fleet.read`) e **não** alcança nenhuma das quatro rotas.
    ...createContractorPreviewEmailRoutes(dependencies),
  ]

  return routes
    .filter((route) => {
      try {
        service.authorize(context, route.policy)
        return true
      } catch {
        return false
      }
    })
    .map((route) => `${route.method} ${route.pathname}`)
    .sort()
}

describe('separator role contract', () => {
  // A lista é exaustiva de propósito: rota nova de frota, faturamento ou CT-e reprova aqui até
  // alguém decidir, por escrito, se o separador a alcança.
  test('reaches the trip write routes and nothing that changes fleet, billing or CT-e', () => {
    // spec 056 T012: as rotas de estado (separate/load/return/batch-status/plan-route/dispatch/
    // cancel) e a leitura de paradas entram sob a mesma trip.manage/fleet.read que já valiam; o
    // separador ganha acesso a elas de graça, sem mudar nenhuma outra permissão.
    expect(reachableRoutes(['separator'])).toEqual([
      /** Spec 169 RF12: remover gasto/receita é a mesma permissão de lançar (trip.manage). */
      'DELETE /trips/:id/costs/:entryId',
      'DELETE /trips/:id/documents/:documentId',
      'DELETE /trips/:id/revenues/:entryId',
      /**
       * Spec 237 T2.3 (ADR-0094 §6): a chegada da carga e a primeira separação, antes da viagem. O
       * separador confere e separa no celular: lê com `fleet.read` e escreve com `trip.manage`, as
       * permissões que já tinha. Nada de frota, faturamento nem fiscal; o vínculo com a viagem
       * continua do fluxo de viagem.
       */
      'GET /cargo-arrivals',
      'GET /cargo-arrivals/:id',
      /** Spec 237 T3.2b (ADR-0094 §9): os itens da nota da chegada para a avaria, `fleet.read`. */
      'GET /cargo-arrivals/:id/documents/:documentId/products',
      /** Spec 237 T3.2 (ADR-0094 §9): a ocorrência de recebimento e os tipos dela, `fleet.read`. */
      'GET /cargo-arrivals/:id/occurrences',
      'GET /cargo-arrivals/available-documents',
      'GET /cargo-arrivals/occurrence-types',
      /**
       * Spec 237 T4.2: a prévia da carga é a chegada antes de chegar (RF5b). O separador lê, envia a
       * planilha e confirma/desvincula/vincula a linha à nota — nada de frota, faturamento nem
       * fiscal; propor a chegada não cria nada.
       */
      'GET /cargo-previews',
      'GET /cargo-previews/:id',
      /**
       * Spec 237 T5.1 (RF7): os rascunhos de viagem da prévia são só leitura (`fleet.read`); nada vira
       * viagem sem o aceite do fluxo de roteirização, que o separador já alcança.
       */
      'GET /cargo-previews/:id/trip-drafts',
      /**
       * Spec 149: a diária geral do ajudante entra na conta que o separador já monta ao escolher a
       * tripulação da viagem — mesma razão do vínculo motorista↔veículo logo abaixo. Ele lê o
       * parâmetro, nunca o edita (`PUT` continua `fleet.manage`, fora desta lista).
       */
      'GET /company-crew-settings',
      'GET /fleet/capabilities',
      // spec 081: o vínculo motorista↔veículo é leitura de `fleet.read`, e o separador a alcança de
      // propósito — é ele quem escolhe veículo e motorista ao montar a viagem. O par não carrega
      // nada além dos dois ids, então não abre ficha de pessoa a quem só monta carga.
      'GET /fleet/driver-vehicles',
      'GET /fleet/drivers',
      /**
       * Spec 159 T8 (RF10/RF11): a nota já chega na listagem que o separador lê para montar a
       * viagem, e é ela que ordena o seletor; a ficha da nota só explica o número (NF-e, data,
       * motivo, pontos) — sem posição da foto nem dado pessoal do motorista.
       */
      'GET /fleet/drivers/:id/score',
      'GET /fleet/drivers/:id/vehicles',
      'GET /fleet/vehicles',
      /**
       * Spec 060 T008 (enumerado na spec 238 T1.3): o feriado do município é `fleet.read`, porque o roteiro
       * consulta, e o separador monta roteiro. Só lê: cadastrar, editar e apagar (e a regra "todo ano", o
       * feriado estadual e o sábado) são `settings.manage`, que ele não tem.
       */
      'GET /municipal-holidays',
      'GET /nfe-documents',
      'GET /nfe-documents/:id',
      'GET /nfe-documents/:id/eligibility',
      /**
       * Spec 149 H3: a mesma `invoices.read` que já dá a nota inteira e o XML — a linha do tempo
       * fiscal (cancelamento, CC-e, resumo) não é dado novo para quem já lê os dois.
       */
      'GET /nfe-documents/:id/events',
      'GET /nfe-documents/:id/xml',
      'GET /nfe-documents/by-access-key/:accessKey/trip-location',
      /**
       * T14 item 4 (revisão de segurança): as rotas de `cargo.measure` (spec 085 G005, spec 152)
       * entram nesta lista pela primeira vez. Decisão registrada aqui: o separador já tinha a
       * permissão `cargo.measure` (contrato "cargo.measure — a permissão de quem mede a caixa"
       * acima), e medir caixa **é** o trabalho de quem separa — as rotas só tornam essa permissão
       * exercível por HTTP, sem abrir nada novo em fleet, billing ou fiscal.
       *
       * Spec 155 (G003, G004): as irmãs e a réplica são a mesma permissão, sobre a mesma caixa —
       * replicar a medida de uma variação para outra continua sendo o trabalho de quem mede.
       */
      'GET /nfe-package-boxes',
      'GET /nfe-package-boxes/:id/siblings',
      'GET /nfe-package-boxes/measurement-settings',
      // A exportação do que falta medir é a mesma fila, inteira — a mesma cargo.measure.
      'GET /nfe-package-boxes/pending-export',
      /**
       * Spec 183 T505 (RF9): a fila de mensagens sem conversa é leitura da listagem (`fleet.read`),
       * como as conversas; atribuir é `occurrences.resolve`, e ele não alcança.
       */
      'GET /occurrence-conversations/unassigned',
      /**
       * T18 (revisão): a página de pendências (spec 147 T14/T15) usa a mesma `fleet.read` de toda
       * leitura de frota, e o separador a alcança de propósito — placa de veículo sem carroceria é
       * dado mínimo, e é ele quem monta a viagem em cima do que a frota tem cadastrado.
       */
      'GET /pending-items',
      /**
       * Spec 148 T7: a fila das notas que não couberam é lida sob `fleet.read`, como a viagem. O
       * separador a alcança porque é ele quem monta o caminhão e decide para onde a nota vai; ela
       * mostra número da nota, motivo e o Δ% de peso e espaço — nada de dinheiro nem ficha de pessoa.
       */
      /** Spec 253 RF1: o relatório de viagens, sob `TRIP_FIELD_READ_POLICY` como as outras leituras de campo; o valor só sai com `trip.financials`, que ele não tem. */
      'GET /trip-document-report',
      /** Spec 253 RF10: o PDF de canhotos segue a mesma política de leitura; o valor da nota sai só com `trip.financials`. */
      'GET /trip-document-report/proofs-pdf',
      'GET /trip-document-reviews',
      'GET /trip-document-reviews/:id/swap-suggestions',
      'GET /trip-documents/returned-with-active-cte',
      /**
       * O feed de ocorrências da empresa, e o separador **lê** — decisão registrada aqui em
       * 2026-09-04, a pedido de quem responde pelo produto.
       *
       * Ele já **escreve** ocorrência de separação (item faltante ou avariado, logo abaixo), e ler
       * o feed é o outro lado do mesmo trabalho: a nota que volta do campo com problema é a que ele
       * vai separar de novo, e descobrir isso pela ocorrência é mais barato que descobrir com a
       * carga na mão.
       *
       * ⚠️ **Isto não lhe dá `trip.report`.** A ocorrência de **entrega** continua sendo do campo —
       * quem entrega é quem a cria, e a linha entre barracão e rua da ADR-0043 segue de pé. O que
       * mudou é que ele passa a **ver** o que o campo relatou, não a relatar por ele.
       *
       * ⚠️ As duas rotas entraram por `TRIP_READ_POLICY` (= `fleet.read`) numa spec paralela, sem
       * passar por esta lista — foi este contrato que as barrou até a decisão existir. É para isso
       * que ele lista por extenso.
       */
      'GET /trip-occurrences',
      'GET /trip-occurrences/:id/attachments',
      // Spec 183 T404: ler a conversa é da listagem; escrever à contratante não (occurrences.resolve).
      'GET /trip-occurrences/:id/conversations',
      'GET /trips',
      'GET /trips/:id',
      /**
       * Spec 156 D10: as ações permitidas da viagem, e o separador as lê — decisão registrada aqui.
       * A lista é recortada pelas permissões dele: recebe as do barracão (separar, carregar, roteiro,
       * despacho) e **nenhuma** de rua (`deliver`, `return`, `field*`), pela ressalva A1.
       */
      'GET /trips/:id/allowed-actions',
      /** Spec 222 RF-A1: os comprovantes da viagem em lote — `fleet.read`, como o de uma nota logo abaixo. */
      'GET /trips/:id/delivery-proofs',
      'GET /trips/:id/documents/:documentId/delivery-address-history',
      /**
       * Spec 079 T020: o que houve com a carga, e o separador **lê e escreve** — decisão registrada
       * aqui. Ele é quem encontra o item faltante ou avariado ao separar; a ocorrência de separação
       * nasceu para ele.
       *
       * ⚠️ A ocorrência de **entrega** não está nesta lista, e não é esquecimento: ela é
       * `trip.report`, do campo, e o separador não a tem. Aqui a linha entre barracão e rua é a
       * mesma da ADR-0043 — o mesmo motivo pelo qual ele não reporta entrega.
       */
      'GET /trips/:id/documents/:documentId/occurrences',
      /**
       * Spec 079 T019: os itens da nota, e o separador os alcança — decisão registrada aqui.
       *
       * Conferir o que vai dentro da caixa **é** o trabalho dele: é a lista que ele lê de pé no
       * galpão para saber que a carga está completa antes de carregar. Esconder isso de quem separa
       * seria esconder a informação de quem mais a usa.
       *
       * ⚠️ A rota publica código, descrição e quantidade — **nunca NCM e CFOP**, que são
       * classificação fiscal. Se algum dia ela passar a publicá-los, esta decisão se reabre.
       */
      'GET /trips/:id/documents/:documentId/products',
      /**
       * Spec 079 T004: o comprovante de entrega, e o separador o alcança — decisão registrada aqui.
       *
       * Ele já lê o detalhe inteiro da viagem por `fleet.read`, incluindo que a nota foi entregue e
       * quando; negar só o canhoto exigiria permissão nova para uma fatia do que ele já vê. E é ele
       * quem atende o cliente que liga perguntando quem recebeu — mandá-lo pedir a outra pessoa
       * para abrir a mesma tela não protege ninguém.
       *
       * ⚠️ O que o comprovante carrega de terceiro é o **nome** de quem recebeu, nunca documento
       * (ADR-0045 §7). Se algum dia ele carregar mais que isso, esta decisão se reabre.
       */
      'GET /trips/:id/documents/:documentId/proof',
      // Spec 059: a prontidão fiscal é leitura da viagem, e o separador a lê como o resto dela
      'GET /trips/:id/fiscal-readiness',
      /**
       * Spec 079: a linha da estrada no mapa. Ela **é** o roteiro, e o roteiro é dele — quem ordena
       * as paradas precisa ver por onde o caminhão vai passar. Nada de terceiro aparece aqui: são
       * as coordenadas das paradas que ele já lê no detalhe, ligadas pela estrada.
       */
      'GET /trips/:id/route-geometry',
      /**
       * Spec 060 D3: o agendamento **é** do separador, e é decisão registrada aqui. Ele monta a
       * viagem, e o portão do despacho que a pendência de agendamento levanta é dele para limpar —
       * mandar isso para outra pessoa deixaria o caminhão parado esperando quem não está no galpão.
       * O que ele continua não fazendo é emitir documento fiscal e reportar entrega.
       */
      'GET /trips/:id/schedules',
      'GET /trips/:id/stops',
      /**
       * Spec 158 T6: a linha do tempo unificada da viagem, sob a mesma `TRIP_FIELD_READ_POLICY`
       * (`fleet.read` ou `trip.report-on-behalf`) das outras leituras de campo listadas acima — o
       * separador já enxerga cada uma delas espalhada; aqui é a mesma informação, só unida.
       */
      'GET /trips/:id/timeline',
      /**
       * Spec 145 T11: a pergunta de novo pela planta que a prévia de carga pediu. Espelha a
       * permissão da prévia (`trip.manage`), e o separador a alcança pela mesma razão que alcança a
       * prévia (spec 085, abaixo): sem ela, a planta que ele pediu nunca chegaria à tela dele. Ela
       * devolve só a planta e o estado do cálculo — nada de receita, custo ou ficha de pessoa.
       */
      'GET /trips/cargo-layouts/:layoutId',
      /**
       * Spec 216: mesma `trip.manage` de `POST /trips` (criar) acima — o separador já monta a
       * tripulação na criação; corrigi-la antes do roteiro planejado é o mesmo trabalho, não um
       * novo. Bloqueada a partir de `route_planned` pela própria máquina de estados.
       */
      'PATCH /trips/:id/crew',
      /** Spec 167 (RF2/RF10): mesma permissão do registro — corrigir o conjunto de itens. */
      'PATCH /trips/:id/documents/:documentId/occurrences/:occurrenceId/items',
      'PATCH /trips/:id/stops/order',
      'POST /cargo-arrivals',
      'POST /cargo-arrivals/:id/close',
      /**
       * Spec 237 T3.2 (ADR-0094 §9.5, ajuste 8): o separador abre a avaria, marca e conclui a
       * devolução (`trip.manage`), mas NÃO desfaz a marcação — `return-unmark` é
       * `occurrences.resolve`, e a ausência dele aqui é a prova.
       */
      'POST /cargo-arrivals/:id/documents/:documentId/occurrences',
      'POST /cargo-arrivals/:id/documents/:documentId/receive',
      'POST /cargo-arrivals/:id/documents/:documentId/return-complete',
      'POST /cargo-arrivals/:id/documents/:documentId/return-mark',
      'POST /cargo-arrivals/:id/documents/:documentId/separate',
      'POST /cargo-arrivals/:id/documents/batch-status',
      'POST /cargo-arrivals/:id/route-assignment',
      'POST /cargo-previews',
      'POST /cargo-previews/:id/items/:itemId/confirm',
      'POST /cargo-previews/:id/items/:itemId/link',
      'POST /cargo-previews/:id/items/:itemId/unlink',
      'POST /cargo-previews/:id/propose-arrival',
      // Spec 155 (G004): a mesma cargo.measure de GET .../:id/siblings, acima.
      'POST /nfe-package-boxes/:id/replicate',
      // Spec 183 T404 (RF15): marcar a conversa como lida é registro do próprio usuário (`fleet.read`).
      'POST /occurrence-conversations/:id/read',
      /**
       * A mesma linha da estrada da rota irmã, para pontos que **ainda não são viagem**: é o mapa
       * do formulário, onde o separador confere a ordem antes de criar a viagem. Alcança pelo mesmo
       * `fleet.read` de `GET /trips/:id/route-geometry`, e pela mesma razão — quem ordena as
       * paradas precisa ver por onde o caminhão passa. O corpo leva coordenadas que ele já escolheu
       * na tela; nada de ficha de pessoa entra aqui.
       */
      'POST /route-geometry',
      /**
       * Spec 148 T7 (D7): tirar, mover e trocar nota que não coube é `trip.manage` — "quem monta a
       * viagem (o que inclui o separador) decide". A trava é a mesma do vínculo: o despacho.
       */
      'POST /trip-document-reviews/:id/move',
      'POST /trip-document-reviews/:id/move-preview',
      'POST /trip-document-reviews/:id/swap',
      'POST /trips',
      'POST /trips/:id/cancel',
      'POST /trips/:id/cargo-layouts/:layoutId/release-unplaced',
      /**
       * Spec 156 T8c (ADR-0067, achado da T8b): `POST /trips/:id/close` deixou de ser
       * `trip.manage`. Encerrar é do escritório — confirma quantas notas ficam sem baixa e exige
       * motivo quando alguma está em aberto — e passou para `trip.report-on-behalf`. O separador
       * monta a viagem; ele não é quem confirma o fim da entrega.
       */
      /**
       * Spec 061: pedágio e avulso são lançamento de **operação**, não de dinheiro sensível — quem
       * monta a viagem lança, e o resultado (que mostra margem e o que se paga ao agregado) continua
       * fora do alcance dele.
       */
      'POST /trips/:id/costs',
      'POST /trips/:id/dispatch',
      'POST /trips/:id/documents',
      'POST /trips/:id/documents/:documentId/delivery-address',
      'POST /trips/:id/documents/:documentId/load',
      /**
       * Spec 079 T020: registrar item faltante ou avariado **é** o trabalho de quem separa — ele é
       * quem encontra. A ocorrência de entrega não está aqui e não é esquecimento: ela é
       * `trip.report`, do campo, pela mesma linha da ADR-0043 que o impede de reportar entrega.
       */
      /**
       * Spec 079: **uma rota só**, desde que o tipo virou cadastro da empresa. Antes eram duas — uma
       * por grupo — porque o grupo vinha do corpo e a autorização precisava ser estática. Com o tipo
       * no banco, o grupo vem do cadastro e o caso de uso o confere.
       *
       * O separador alcança: registrar item faltante ou avariado **é** o trabalho de quem separa. Um
       * tipo de rua mandado por aqui não lhe dá nada — a permissão é a mesma e o registro também; o
       * que muda é que o motorista tem a rota dele em `/me`, com o escopo da viagem ativa.
       */
      'POST /trips/:id/documents/:documentId/occurrences',
      /** Spec 161 T7 (RF6): mesma permissão do registro — a segunda foto em diante. */
      'POST /trips/:id/documents/:documentId/occurrences/:occurrenceId/attachments',
      /** Spec 167 (RF6/RF10): mesma permissão do registro — cancelar com motivo. */
      'POST /trips/:id/documents/:documentId/occurrences/:occurrenceId/cancellation',
      'POST /trips/:id/documents/:documentId/separate',
      /**
       * Decisão escrita (spec 075): **o separador alcança o vínculo em lote.** Ele já alcançava o
       * vínculo unitário (`POST /trips/:id/documents`) sob a mesma `trip.manage`, e o lote é a mesma
       * operação num pedido só — quem monta a viagem a partir de um maço de notas é justamente ele.
       * Negar o lote e permitir o unitário seria arbitrário, e empurraria a montagem de trezentas
       * notas de volta para trezentas requisições.
       */
      'POST /trips/:id/documents/batch',
      'POST /trips/:id/documents/batch-status',
      'POST /trips/:id/plan-route',
      /** Spec 169: receita lançada é a mesma trilha do gasto — mesma permissão, quem monta a viagem lança. */
      'POST /trips/:id/revenues',
      'POST /trips/:id/stops/:stopId/schedule',
      /**
       * ⚠️ **Decisão escrita (spec 085 G002/G003):** o separador **alcança** a prévia de carga. Ela
       * responde "cabe no baú, e em que ordem entra?", que é a pergunta de quem carrega o caminhão
       * — e por isso ela nasceu sob `trip.manage`, e não sob `trip.financials` como a prévia de
       * valores ao lado. Ele continua sem enxergar receita, custo e margem.
       */
      'POST /trips/cargo-preview',
      'PUT /nfe-package-boxes/:id',
      // Spec 163 (P1): a medida da unidade é a mesma cargo.measure de quem mede a caixa.
      'PUT /nfe-package-boxes/:id/unit',
      /**
       * ⚠️ **Decisão escrita (spec 147 D3):** o separador alcança `PUT /trips/:id/trailer`. Montar a
       * viagem inclui escolher a carreta que o cavalo puxa, a mesma tarefa de vincular nota e
       * planejar rota — por isso a rota mora sob `trip.manage`, e não sob `fleet.manage`.
       */
      'PUT /trips/:id/trailer',
    ])
  })

  test('is refused by every write route of fleet, billing and CT-e', () => {
    const reachable = new Set(reachableRoutes(['separator']))

    for (const route of [
      'POST /fleet/vehicles',
      'PATCH /fleet/vehicles/:id',
      'POST /fleet/drivers',
      'PATCH /fleet/drivers/:id',
      'PUT /fleet/drivers/:id/vehicles',
      'GET /fleet/drivers/availability',
      'PUT /company-crew-settings',
      'GET /billing/eligible-ctes',
      'GET /billing/invoices',
      'POST /billing/invoices',
      'PATCH /billing/invoices/:id',
      'POST /billing/invoices/:id/cancel',
      'POST /cte-batches/:id/issue',
      'POST /cte-batches/:id/items/:itemId/cancel',
      'POST /cte-batches/items/export',
    ]) {
      expect(reachable.has(route)).toBe(false)
    }
  })

  // O separador monta a viagem; o MDF-e é documento fiscal e continua com quem responde por ele.
  test('does not reach the fiscal manifest of the trip it assembles', () => {
    expect(reachableRoutes(['separator'])).not.toContain('POST /trips/:id/mdfe-manifests')
  })

  /**
   * ADR-0067 §1, spec 156 T8b (revisão do code-reviewer): não basta a rota estar ausente da lista
   * exaustiva — o teste exercita `AuthorizationService.authorize` de verdade, com o contexto real
   * do `separator` e a `OFFICE_REPORT_POLICY` exportada da própria rota, para provar que é a
   * política (`trip.report-on-behalf`) que barra, não um acidente de composição do array de rotas.
   */
  test('a política real de field-delivery/field-return recusa o separador', () => {
    const service = new AuthorizationService()
    const context = companyContext(['separator'])

    expect(() => service.authorize(context, OFFICE_REPORT_POLICY)).toThrow()
  })
})

/**
 * Spec 249 D3: transferir a tripulação de uma viagem que já saiu é do escritório que dá baixa em nome
 * do motorista (`trip.report-on-behalf`). O separador monta a viagem; ele não a passa para outra
 * pessoa depois que ela saiu — a lista exaustiva acima já prova a ausência, e aqui está a razão.
 */
describe('a transferência de tripulação na rua (spec 249)', () => {
  const TRANSFER_ROUTE = 'POST /trips/:id/crew-transfers'

  test('o separador e o leitor não alcançam a rota', () => {
    expect(reachableRoutes(['separator'])).not.toContain(TRANSFER_ROUTE)
    expect(reachableRoutes(['viewer'])).not.toContain(TRANSFER_ROUTE)
  })

  test('quem dá baixa em nome do motorista alcança', () => {
    for (const role of ['company-admin', 'operator', 'finance'] as const) {
      expect(reachableRoutes([role])).toContain(TRANSFER_ROUTE)
    }
  })

  test('é a permissão de dar baixa que barra, não um acidente de composição', () => {
    expect(resolveCompanyPermissions(['separator'])).toContain('trip.manage')
    expect(resolveCompanyPermissions(['separator'])).not.toContain('trip.report-on-behalf')
  })
})

/**
 * Spec 085 G005: medir a caixa é trabalho de galpão, e ele precisa de permissão própria.
 * `settings.manage` entregaria de carona o preço do combustível, a tabela de frete e a credencial
 * da prefeitura — e é o que o conferente teria de receber se a medição pegasse carona nela.
 */
describe('cargo.measure — a permissão de quem mede a caixa', () => {
  test('chega ao separador, ao operador e ao administrador', () => {
    for (const role of ['separator', 'operator', 'company-admin'] as const) {
      expect(resolveCompanyPermissions([role])).toContain('cargo.measure')
    }
  })

  /** Quem mede não passa a administrar configuração — é o ponto de a permissão existir. */
  test('não arrasta settings.manage para quem mede', () => {
    expect(resolveCompanyPermissions(['separator'])).not.toContain('settings.manage')
  })

  /** Ler e medir são a mesma tela; papel de campo e contratante não têm galpão nenhum. */
  test('não alcança motorista, agregado nem contratante', () => {
    for (const role of ['driver', 'aggregate', 'contractor'] as const) {
      expect(resolveCompanyPermissions([role])).not.toContain('cargo.measure')
    }
  })
})
