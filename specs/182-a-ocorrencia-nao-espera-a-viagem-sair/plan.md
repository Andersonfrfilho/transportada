# Plan — Feature 182

Caminhos relativos a `apps/api-transportada/src/` na API, salvo indicação. Sem mudança de
frontend: `TripStopList`/`TripHeaderActions`/`TripDetail` já são 100% server-driven — o botão
aparece quando `allowed-actions` lista a ação (`tripAllowedActions.validation.ts` só copia os
nomes por valor; `resolveFieldActionCapabilities`/`canOfferStopFieldAction` não duplicam regra de
estado). Confirmado lendo os quatro arquivos antes de tocar em código: nenhum deles checa
`trip.status` para esconder botão de ocorrência/baixa — só o `workspace.status === 'loading'` do
TanStack Query, que é estado de carregamento assíncrono, sem relação com o domínio.

## D1 — A máquina, não só a lista, libera a baixa antes do despacho (RF3)

O cabeçalho de `trip-allowed-actions.policy.ts` já promete: "uma ação entra quando a máquina
**aplicaria agora**". Se `fieldDelivery` vai aparecer em `loading`, a máquina precisa aceitar a
transição — senão o botão aparece e o toque volta 409. A escrita real
(`document-outcome-steps.service.ts:96` `settleAndRecordEvent`) chama
`checkTripDocumentTransition`, que é a única fonte tanto para o canal `office` quanto para o do
motorista — não existe um segundo gate escondido em rota.

`trip-state.policy.ts` `checkTripAcceptsDocumentWork` (:186-204): hoje trata `deliver` e `return`
juntos como "trabalho de rua" (`isStreetWork`), exigindo `isTripDispatched`. Passa a:

- `deliver`: sem exigência de despacho — só falta o documento estar `loaded` (checado depois, em
  `checkDocumentOrigin`) e a viagem não estar `cancelled`/`completed` (checado antes, topo da
  função, inalterado). **`return` continua exigindo rua** — devolução é sempre um retorno físico
  de algo que saiu; RF3 não pede isso, e a spec não cobre esse caso.

Efeito colateral aceito e documentado (RF3, decisão do usuário 24/09): o motorista também poderia,
tecnicamente, entregar antes do despacho pelo mesmo caminho — inalcançável na prática (o app dele
só mostra documento de viagem já despachada), mas o comentário no código registra isso para quem
vier depois.

`checkTripAcceptsDocumentWork` é usado por `trip-manifest.policy.ts` e pelo menu do operador no
WhatsApp (`checkTripAcceptsDocumentWork` é exportado justamente para não duplicar) — conferir que
nenhum dos dois assume implicitamente `deliver` bloqueado antes do despacho.

## D2 — Ocorrência na linha da nota não espera o despacho (RF2)

`trip-allowed-actions.policy.ts` `resolveFieldDocumentActions` (:196-214): hoje só oferece
`fieldOccurrence`/`fieldProof` quando `isTripDispatched(trip.status)`. Passa a: `fieldProof`
continua exigindo despacho (canhoto só existe depois de entregar, que já exige rua por `return`
não ter mudado — mas `deliver` sim; ainda assim `fieldProof` só faz sentido com
`separationStatus === 'delivered'`, que só a rua ou a baixa antecipada produzem — mantém o gate
por clareza, sem mudar comportamento observável hoje). `fieldOccurrence` deixa de depender de
`isTripDispatched` — só depende de o documento não estar liberado (já checado no chamador) e a
viagem não estar `cancelled` (não estar `completed` não bloqueia — comportamento pré-existente,
spec 156, fora do escopo daqui).

## D3 — Ocorrência de parada não espera a viagem sair (RF1)

`trip-allowed-actions.policy.ts` `resolveStopActions` (:148-158): hoje a mesma guarda
(`!canReportInField || !isTripOnRoad`) barra `arrive` e `occurrence` juntos. Passa a:

- `occurrence`: só exige `canReportInField` e viagem não `cancelled`/`completed` ("o que terminou
  não recebe registro novo", caso extremo da spec).
- `arrive`: continua exigindo `isTripOnRoad` — não se chega aonde não se foi (fora de escopo,
  P3/CA02).

## Testes a atualizar (TDD, contrato primeiro)

- `test/trip-domain/trip-state.contract.ts`: dois testes hoje tratam `deliver`+`return` como um
  bloco só (`'delivers and returns only from loaded, and only on the road'`,
  `'keeps warehouse work out of the street and street work out of the warehouse'`) — precisam
  separar as duas ações, com `deliver` aplicável em qualquer estado não-terminal e `return` só em
  `DISPATCHED_STATUSES`.
- `test/trip-allowed-actions/policy.contract.ts`: `'parada fora da rua (antes do despacho ou
concluída) não tem ação'` some (loading passa a ter `['occurrence']`); novos casos para RF1/RF2/RF3
  cobrindo `draft` com nota vinculada, `loading`, `cancelled`, `completed` explicitamente (RNF da
  spec: "cobrir cada estado explicitamente").
- Novo teste de integração (`test/integration/trip-field-office.integration.ts`): `field-delivery`
  contra Postgres real com a viagem em `loading` responde 200 e grava `delivered` — prova que o
  gate da rota (não só o da policy de listagem) mudou.

## Fora do escopo (confirmado, sem código)

- Formulário de ocorrência (specs 164/166/167) e exigência de foto por tipo (spec 179): usam o
  mesmo componente/rota, sem mudança.
- `fieldReturn`/`return`: gate inalterado.
- `confirmLoad`/legado (spec 185, ADR-0074 §5): não mexido.
- Frontend: nenhum arquivo `.tsx` muda (D0 acima).
