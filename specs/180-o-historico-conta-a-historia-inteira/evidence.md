# Evidência — Feature 180

## T102 — o seeder grava o perfil de identidade

Causa provada com consulta ao banco local: `trip_document_events` de `loaded` tinham
`actor_user_id`, resolviam em `identity_users` e tinham `user_company_memberships` **ativa** — e a
tela dizia "por usuário removido". Faltava a linha em `identity_user_profiles`, que é de onde a
autoria lê o nome (`timelineActorProfile`).

O seed parava em `identity_users`; os três caminhos de criação em produção gravam usuário e perfil
na mesma transação, então produção nunca chega nesse estado.

```
$ bunx tsc --noEmit                        # sem saída
$ bunx eslint src/database                 # sem saída
$ bun --env-file=../../.env.test test --timeout 120000
 7212 pass · 0 fail · 183 arquivos [30.32s]
```

⚠️ A tela afirmar remoção sobre qualquer nome ausente é defeito à parte, que vale em produção — é o
RF3/T201 desta spec, e não foi corrigido aqui.

## T201/T202 — "usuário removido" reservado a vínculo perdido

- `bunx tsc --noEmit` → 0 erros.
- `bunx eslint src/modules/trip test/trip --max-warnings=0` → 0 problemas.
- `bun test ./test/trip.contract.test.ts` → 1538 pass, 0 fail, 18967 expect() calls (875ms).
- Commit: `4f9dd1e3e` — `fix(trip): autor sem nome vira "não identificado", nunca "removido" (spec 180 T201/T202)`.
- Arquivos: `src/modules/trip/shared/fieldAuthorship.service.ts`,
  `src/modules/trip/shared/tripTimeline.service.ts`,
  `src/modules/trip/locales/trip.locale.json`, `src/modules/trip/locales/trip.en.locale.json`,
  `test/trip/field-occurrence-authorship.contract.ts`, `test/trip/timeline-view.contract.ts`.
- Nota: a chave `authorship.removedActor` continua nos dois idiomas — reservada para quando a API
  mandar um sinal real de vínculo perdido (RF3). Hoje nenhum caminho de código a produz.

## T301/T302 — o evento leva à nota e à parada

- `bunx tsc --noEmit` → 0 erros.
- `bunx eslint src/modules/trip test/trip --max-warnings=0` → 0 problemas.
- `bun test ./test/trip.contract.test.ts` → 1541 pass, 0 fail, 18972 expect() calls (848ms) — +3
  testes novos de `test/trip/timeline-link.contract.ts`.
- Commit: `531a233a3` — `feat(trip): o evento da linha do tempo leva à nota e à parada (spec 180 T301/T302)`.
- Decisão de design registrada em código: o app não tem router (`main.tsx` decide por
  `pushState`/`popstate`, sem segmento nem query param para nota/parada — confirmado por
  exploração antes de escrever). O link é uma âncora de página (`href="#id"`) para o mesmo id que
  `TripStopList.component.tsx` marca na linha da nota e no card da parada
  (`data-revealed-panel` reaproveita a folga de rolagem já declarada em `src/styles/index.css`).
  Zero requisição nova (RF18); o fragmento não dispara `popstate`, então não conflita com o
  roteamento manual do shell.
- Arquivos: `src/modules/trip/shared/tripTimelineLink.service.ts` (novo),
  `src/modules/trip/components/TripTimeline.component.tsx`,
  `src/modules/trip/components/TripStopList.component.tsx`,
  `src/modules/trip/styles/tripTimeline.module.css`, locales,
  `test/trip/timeline-link.contract.ts` (novo), `test/trip.contract.test.ts`.

## T303/T304/T305 — o evento expande, e a foto vem só ali

- `bunx tsc --noEmit` → 0 erros.
- `bunx eslint src/modules/trip test/trip --max-warnings=0` → 0 problemas.
- `bun test ./test/trip.contract.test.ts` → 1550 pass, 0 fail, 18983 expect() calls (863ms) — +9
  testes novos de `test/trip/timeline-detail.contract.ts` (T303).
- Commit: `2123c47e3` — `feat(trip): o evento com mais a dizer expande no lugar, e a foto vem só ali (spec 180 T303/T304/T305)`.
- T305 usa o hook já existente `useTripOccurrenceAttachmentsQuery` (`queries/tripOccurrenceFeed.query.ts`),
  o mesmo padrão de `OccurrenceAttachments` em `TripOccurrenceTable.component.tsx`: esqueleto até
  a resposta, grade da `OccurrenceAttachmentGrid` silenciosa quando o resultado vem vazio. O
  coordenador confirmou por leitura de `listDocumentOccurrenceAttachmentLocations` (API) que a
  rota atende tanto ocorrência de galpão quanto de rua (fallback por `attachment_object_id`), então
  não há pendência a registrar aqui.
- Links (T301/T302) e avatar (T402, à parte) continuam visíveis fechado; o que RF16 recolhe é
  motivo/observação/fotos — não o caminho até a nota/parada nem a identificação de quem fez.
- Arquivos: `src/modules/trip/shared/tripTimelineDetail.service.ts` (novo),
  `test/trip/timeline-detail.contract.ts` (novo),
  `src/modules/trip/components/TripTimeline.component.tsx`,
  `src/modules/trip/styles/tripTimeline.module.css`, locales, `test/trip.contract.test.ts`.

## T401/T402 — avatar de iniciais e observação rotulada

- `bunx tsc --noEmit` → 0 erros.
- `bunx eslint src/modules/trip test/trip --max-warnings=0` → 0 problemas.
- `bun test ./test/trip.contract.test.ts` → 1557 pass, 0 fail, 18998 expect() calls (1428ms) — +7
  testes novos de `test/trip/timeline-avatar.contract.ts` (T402).
- Commit: `0897c2be5` — `feat(trip): avatar de iniciais e observação rotulada na linha do tempo (spec 180 T401/T402)`.
- T401 (RF17): `eventTimeline.closeReason` é chave **compartilhada** com `TripDetail.component.tsx`
  (linha do encerramento manual) e testada por `test/trip/close-detail-line.contract.ts` no formato
  exato "Motivo do encerramento: {{reason}}" — não pude reformatá-la em label/valor separados sem
  quebrar aquele uso. `returnReason`/`closeReason` já eram "rótulo: valor" (RF17 satisfeito); o caso
  realmente embutido era a observação da ocorrência (texto solto, sem rótulo), que ganhou
  `eventTimeline.occurrenceNote` ("Observação: {{note}}"/"Note: {{note}}"). A hierarquia visual
  título/meta/detalhe ganhou reforço em CSS (`.itemDetailGroup` com borda à esquerda, já criada em
  T304) e o avatar entra ao lado do título em `.itemHead`.
- T402: paleta fixa de 6 cores em `tripTimeline.module.css` (`.avatarPalette0`.."5"), a mesma em
  claro e escuro — como `--vehicle-color-*`, é identidade, não tema. Índice por hash determinístico
  do nome (`resolveTripTimelineAvatarPaletteIndex`), nunca `Math.random`.
- Arquivos: `src/modules/trip/shared/tripTimelineAvatar.service.ts` (novo),
  `test/trip/timeline-avatar.contract.ts` (novo),
  `src/modules/trip/components/TripTimeline.component.tsx`,
  `src/modules/trip/styles/tripTimeline.module.css`, locales, `test/trip.contract.test.ts`.

## Ações de campo saem do painel

Decisão do usuário em 23/09: a tela do detalhe listava as paradas duas vezes — em
`TripStopList.component.tsx` (ações de escritório) e de novo em `TripFieldActions.component.tsx`
("Ações de campo (pelo motorista)"), que existia só para registrar chegada e ocorrência de parada.

- **Registrar chegada** e **registrar ocorrência de parada** foram para a linha/card da própria
  parada, em `TripStopList.component.tsx`. Os diálogos (`TripArrivalDialog`,
  `TripStopOccurrenceDialog`) e o gate (`canReportOnBehalf` + capacidade da parada) são os mesmos —
  só o local mudou. O estado de qual parada está com diálogo aberto (`arrivalStopId`/
  `occurrenceStopId`) subiu para `TripStopList`, um diálogo só para a lista inteira, do jeito que o
  painel antigo já fazia.
- **Conferir carga** e **iniciar rota** foram para `TripHeaderActions.component.tsx` — o bloco de
  ações da viagem que já hospeda "liberar para separação" (`planRoute`) e "cancelar viagem". Ficam
  visíveis com `canReportOnBehalf` (independente de `canManage` — são permissões distintas,
  `trip.report-on-behalf` × `trip.manage`); o cabeçalho passou a renderizar quando qualquer uma das
  duas permissões libera alguma ação, e "cancelar" continua a última (destrutiva).
- O seletor de motorista (só aparece com mais de um na viagem) moveu junto para o cabeçalho — é o
  mesmo controle, sem duplicar: `TripDetail` já mantinha o estado (`selectedOfficeDriverId`/
  `officeDriverId`) fora do painel removido, então nada de comportamento mudou.
- `TripFieldActions.component.tsx` foi removido, junto da chave de locale órfã `fieldActions.title`
  (nos dois idiomas). `fieldActions.driverLabel`/`arrive`/`occurrence`/`confirmLoad`/`startRoute`/
  `startRouteConfirm`/`startRouteMessage`/`startRouteTitle`/`returnReason` continuam — usadas pelos
  diálogos, por `FieldDeliveryWizardHeader` ou pela linha do tempo, conferido por grep antes de
  qualquer remoção.
- Dois helpers puros novos em `tripFieldActions.service.ts` — `canOfferStopFieldAction` e
  `canOfferTripFieldAction` — porque nem `TripStopList` nem `TripHeaderActions` têm suíte de render;
  cobrem exatamente a combinação `canReportOnBehalf` × capacidade (da parada ou da viagem), com o
  caso de cada um faltando sozinho e o de `allowedActions` ausente (falha fechada).

```
$ bunx tsc --noEmit                                          # sem saída
$ bunx eslint src/modules/trip test/trip --max-warnings=0     # sem saída
$ bun test ./test/trip.contract.test.ts
 1564 pass · 0 fail · 19006 expect() calls [964ms] — +7 testes novos de
 test/trip/field-action-capabilities.contract.ts (canOfferStopFieldAction/canOfferTripFieldAction)
```

- Arquivos: `src/modules/trip/shared/tripFieldActions.service.ts`,
  `src/modules/trip/components/TripStopList.component.tsx`,
  `src/modules/trip/components/TripHeaderActions.component.tsx`,
  `src/modules/trip/components/TripDetail.component.tsx`,
  `src/modules/trip/components/TripFieldActions.component.tsx` (removido),
  `src/modules/trip/locales/trip.locale.json`, `src/modules/trip/locales/trip.en.locale.json`,
  `test/trip/field-action-capabilities.contract.ts`.

## Pendente (fora do escopo desta execução)

- **Fase 5 (T501-T503)**: bloqueada — mexe no contrato da timeline (`TRIP_TIMELINE_ITEM_KEYS`) e a
  API está sendo tocada por outra sessão no momento. Não executada por instrução explícita.
- **Revisão de design com print (T503/CA18)**: depende da Fase 5 e não foi feita.
