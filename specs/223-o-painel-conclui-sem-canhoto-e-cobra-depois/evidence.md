# Evidência — Feature 223

## T1.1 — A API aceita a baixa sem canhoto (2026-10-01)

Vermelho primeiro: os dois casos novos no contrato falharam pelo motivo certo, apontando a linha da
policy (`office-delivery-proof.policy.ts:57`, `TripDeliveryProofPhotoRequiredError`).

Verde depois:

```
bun --env-file=../../.env.test test ./test/driver-trip.contract.test.ts
→ 136 pass, 0 fail, 497 expect()

DRIZZLE_TEST_DATABASE_URL=… bun --env-file=../../.env.test test \
  ./test/integration/trip-field-office.integration.ts \
  ./test/integration/trip-field-office-review.integration.ts
→ 42 pass, 0 fail, 171 expect()  (Postgres 18.4 descartável, migrations aplicadas)

bun --env-file=../../.env.test test            → 8481 pass, 23 skip, 9 fail
bun run typecheck (api)                        → limpo
bun run test / test:hooks (painel)             → 6176 pass + 180 pass, 0 fail
bun run typecheck (painel)                     → limpo
```

Os 9 vermelhos da suíte cheia são do catálogo de pedágio (spec 154) e são **ambientais**: o Docker
estava fora e eles pedem Postgres. Com o banco descartável apontado, o mesmo arquivo fecha em
`137 pass, 0 fail` — nada a ver com esta feature.

### Dois defeitos que só a integração pegou

O contrato passou com a policy aberta, mas a integração mostrou `proofPending: false` nos dois
casos: `resolveOutcomeProofSettings` devolvia `pendingSettings: undefined` quando o canal passava
`proof` mas não `resolveProofSettings`. A baixa passava sem canhoto **e sem dívida** — exatamente o
risco que a RF3 existe para fechar. Corrigido na fonte (a pendência sai da configuração do
escritório já resolvida), não na fixture; os contratos novos deixaram de passar
`resolveProofSettings` para provar isso.

## Fase 2 — baixa sem canhoto no painel (T2.1 a T2.4)

**Vermelho primeiro.** `test/trip-hooks/office-deliver-without-canhoto.contract.ts` foi escrito antes da
implementação, com quatro casos sobre o hook real (`renderHook` + `tripHookFakes`):

- RF6 — a baixa por nota monta `FormData` com `deliveredAt` e **sem `file`** (`form.get('file') === null`),
  com `Idempotency-Key`.
- RF7 — três notas viram três requisições, na ordem, com três chaves de idempotência distintas.
- RF7 — falha de uma nota (`TRIP_DOCUMENT_NOT_IN_FIELD`) não interrompe o lote: as três saem e só a
  que falhou volta na lista de pendentes.
- RF10 — conta sem `trip.reportOnBehalf` não emite requisição nenhuma: `TRIP_FORBIDDEN` do controller.

Primeira execução: **181 pass / 3 fail**, os três no mesmo ponto —
`rendered.result().batchFieldDeliverMutation` indefinido. Isto confirmou a medição da Fase 1: a mutação
por nota (`fieldDeliverDocumentMutation`) **já existia e nunca era chamada**; o que faltava era só o
leque em massa. O caso de RF6 passou de primeira por esse motivo.

**Verde depois de:** `batchFieldDeliverMutation` em `useTripWorkspace.hook.ts` (leque
`runFieldActionQueue({ concurrency: 3 })`, molde do `batchFieldReturnMutation`), botão "Baixar sem
canhoto" por nota em `TripStopList`, botão "Baixar N notas sem canhoto" em `TripStateActions`,
`handleBatchDeliver` em `TripDetail` (falha parcial reaproveita o resumo da devolução, com `action`
escolhendo a frase) e três chaves de locale (`actions.deliver` renomeada para não confundir com o
caminho do canhoto, `stateActions.batchDeliverWithoutProof`, `stateActions.batchDeliverPartialFailure`).

```
bun run typecheck   → limpo
bun run test        → 6176 pass / 0 fail   (contratos do painel)
bun run test:hooks  → 184 pass / 0 fail    (eram 180 antes desta fase)
```

Nenhum arquivo em `test/integration/**` foi tocado — a fase é só painel.

## Fase 3 — a lista encerra em massa (T3.1 e T3.2)

**Vermelho primeiro.** `test/office-close-in-bulk/selection.contract.ts` (quatro casos sobre o serviço
puro) falhou na importação antes da implementação: `Export named 'closeableSelection' not found`. Os
casos: `completed` e `cancelled` não oferecem encerramento; todo o resto do vocabulário de
`TRIP_STATUS` oferece (varrido pela constante, não por lista copiada); a seleção é a **interseção** da
marcação com o que pode encerrar; id marcado fora da página é ignorado.

Depois: `isCloseable` / `closeableSelection` em `tripSelection.service.ts` (mesmas duas recusas do
botão do detalhe), `closeableSelection` exposta por `useTripTable`, botão "Encerrar N viagens" na
barra de seleção da tabela, `TripCloseBulkDialog` e `closeSelectedMutation` sequencial na página —
sequencial pela mesma razão registrada no cancelamento em lote: `Promise.all` esconderia quais das
outras chegaram a acontecer.

**O motivo é obrigatório no diálogo da lista**, ao contrário do diálogo do detalhe. Lá a tela sabe
quantas notas estão em aberto e dispensa a justificativa quando não há nenhuma; a listagem não traz
essa contagem (o mesmo limite que o `TripCancelDialog` já registra), e buscá-la seriam N requisições
ao abrir o diálogo. Sem saber, pedir o motivo é o lado seguro.

A coluna de caixa de seleção passou a existir para **qualquer** das duas ações (`canCancel || canClose`):
antes ela só aparecia com `trip.manage`, e quem tem só `trip.reportOnBehalf` não teria o que marcar.

```
bun run typecheck   → limpo
bun run lint        → 0 errors (16 warnings pré-existentes)
bun run test        → 6180 pass / 0 fail   (eram 6176; +4 da suíte nova)
bun run test:hooks  → 184 pass / 0 fail
```

A suíte nova foi acrescentada à lista explícita do `package.json` do painel — sem isso ela não roda.

## Fase 4 — a pendência de canhoto legível fora da baixa (T4.1 a T4.4 API)

**Vermelho primeiro (T4.1 e T4.3).** Contrato: `bun --env-file=../../.env.test test ./test/trip-delivery-proof.contract.test.ts ./test/trip-http.contract.test.ts` →
185 pass / 5 fail / 1 error. O erro: `Export named 'isProofRequiredBySettings' not found` em
`proof-pending-settings.contract.ts`; as falhas: o detalhe não serializava `proofPending` e a lista
respondia 400 a `proofPendingEq` (chave fora da allowlist). Integração
(`trip-detail-proof-pending.integration.ts`): os 4 casos vermelhos — três com `Expected: true / Received: undefined`,
e o da exceção do destinatário primeiro por FK (faltava a linha de `delivery_clients`, corrigida na fixture)
e depois pelo mesmo `Received: undefined`.

**Verde (T4.2 e API de T4.4).** `isProofRequiredBySettings` na policy `delivery-proof-settings.policy.ts`
é a regra única do `||` de foto/assinatura: `resolveProofPendingFlag` (escrita) e `proof-pending.query.ts`
(leitura) a chamam. O detalhe lê a pendência com no máximo três consultas fixas, nenhuma quando
não há nota baixada sem foto (`trip-detail-query-count.integration.ts` segue verde). O campo é
derivado, sem coluna nem migration. A exceção por contratante (spec 218) não entra, como no resto da
resolução atual.

**O filtro em SQL é uma segunda cópia da regra.** `proofPendingEq` precisa da condição dentro do
`WHERE` da lista, então `tripHasProofPendingDocumentCondition` reescreve em SQL "exceção do destinatário,
senão geral, senão nada exigido". A cópia fica presa por `trip-list-proof-pending-filter.integration.ts`,
que cruza a lista com o detalhe em seis cenários (foto exigida, com foto, assinatura, nada exigido,
exceção que dispensa, exceção que exige). Esse teste nasceu junto da implementação do filtro, sem
rodada vermelha própria: a rodada vermelha do filtro é a do contrato (`proofPendingEq` → 400).

`proofPendingEq` aceita só `true` e `false`; `maybe` e valor vazio dão 400.

```
bun --env-file=../../.env.test test --timeout 120000          → 8519 pass / 1 fail / 23 skip (8520 testes, 192 arquivos)
  a falha: database-migration (23503 em vez de 23001 — Postgres local ≠ o da CI, já registrado)
bun run typecheck                                              → limpo
integração das viagens (trip*.integration.ts + driver-score)   → 265 pass / 1 skip / 0 fail (39 arquivos)
```

A integração rodou contra o Postgres descartável em `127.0.0.1:55499`
(`DRIZZLE_TEST_DATABASE_URL`): o `DATABASE_URL` do `.env.test` aponta para `localhost:65432`, o
Postgres do Docker com I/O error. As duas suítes de integração novas estão na lista
`test:integration` do `package.json`. A lista inteira (~17 min) não foi rodada; rodaram os 39 arquivos
de viagem e nota do motorista, que são os que leem o detalhe e a lista.

### T4.4 (UI) e T4.5 — painel: filtro na lista e selo na nota

Contrato escrito antes (`apps/frontend-transportada/test/trip/proof-pending.contract.ts`, registrado em
`test/trip.contract.test.ts`). Vermelho:

```
error: Cannot find module '@/modules/trip/shared/proofPendingMarker.service'
 0 pass / 1 fail / 1 error
```

Implementação: `proofPendingMarker.service.ts` (só `true` marca; ausente é API anterior), campo
opcional em `TRIP_DOCUMENT_DETAIL_OPTIONAL_KEYS` e no guard, `proofPendingEq` em `TripFilters`, no
`buildSearch` do cliente (booleano estringado), na pílula, em `setProofPendingFilter` e num `Checkbox`
em `TripFilters`; selo `proofPendingBadge` ao lado do selo de ocorrência em `TripStopList`.

```
bun test ./test/trip.contract.test.ts   → 2202 pass / 0 fail
bun run test                            → 6187 pass / 0 fail (32 arquivos)
bun run test:hooks                      → 184 pass / 0 fail
bun run typecheck                       → limpo
bun run lint                            → 0 erros (16 avisos preexistentes)
```

### Conferência independente da Fase 4 (eu, não o executor)

Relatório de agente não é evidência: os gates da Fase 4 foram rodados de novo, por mim, e as duas
suítes de integração que nasceram sem vermelho foram provadas por mutação.

```
painel  bun run typecheck                 → limpo
painel  bun run test                      → 6187 pass / 0 fail
painel  bun run test:hooks                → 184 pass / 0 fail
api     bun run typecheck                 → limpo
api     bun --env-file=../../.env.test test --timeout 120000
                                          → 8488 pass / 23 skip / 9 fail
api     integração das duas suítes novas  → 10 pass / 0 fail
```

As 9 falhas da API são todas do mesmo arquivo (`toll booth catalog repository`, spec 154) e todas
com `PostgresError: Connection closed` — banco de teste local, não regressão: `git log --name-only
0dcef8512..HEAD` não tem nenhum arquivo de pedágio. A integração rodou contra o Postgres
descartável (`DRIZZLE_TEST_DATABASE_URL`), porque o `DATABASE_URL` do `.env.test` continua com I/O
error.

**Mutação** (o que prende a regra duplicada em TypeScript e em SQL):

| Mutação                                      | Resultado           |
| -------------------------------------------- | ------------------- |
| `isProofRequiredBySettings` → `return false` | 4 pass / **6 fail** |
| `requiredByColumns`: `or` → `and` no SQL     | 7 pass / **3 fail** |

A segunda é a que importa: a paridade TS↔SQL está realmente presa — com `and`, a viagem cuja
configuração exige só a assinatura deixa de aparecer no filtro e três casos caem. A duplicação
fica como dívida consciente: a leitura por nota não pode virar SQL sem perder a função única da
escrita, e o filtro da lista não pode virar TypeScript sem trazer a lista inteira para a memória.

### T5.1 — revisão de design e usabilidade, com print

O painel não sobe sem Keycloak e sem API, e nenhum dublê serve a lista de viagens, então a revisão
usou um harness temporário (`preview-223.html` + `src/preview-223.tsx`, apagados depois, nunca
commitados) servido pelo Vite da própria app na porta 53010. Ele renderiza os quatro pontos novos
com o CSS e os componentes reais: a barra de seleção da lista, o diálogo de encerramento em massa,
a nota com o selo de canhoto pendente e o filtro. Console do browser sem erro.

Dois defeitos de usabilidade achados no print e corrigidos:

| Achado                                                                                                                                  | Correção                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Na mesma nota conviviam **"Dar baixa"** e **"Baixar sem canhoto"** — dois rótulos quase iguais, e o primeiro não dizia que pede canhoto | `actions.fieldDelivery` virou "Dar baixa com canhoto" / "Deliver with proof" (uso único, em `TripStopList`)  |
| A pílula do filtro saía **"Canhoto: Só com canhoto pendente"**, repetindo a palavra                                                     | `filters.proofPendingPillValue` ("Pendente" / "Pending") só para a pílula; o checkbox mantém a frase inteira |

Conferido depois da correção, na própria página: os botões da nota são "Dar baixa com canhoto"
(primário, ícone de câmera) e "Baixar sem canhoto" (secundário, ícone de check); a pílula é
"Canhoto: Pendente".

Duas observações **não** corrigidas, por consistência com o que já existe: "Cancelar selecionadas"
não traz contagem enquanto "Encerrar 2 viagens" traz (o rótulo do cancelar é da spec 102, e a
contagem já aparece à esquerda da barra); e a lista de viagens dentro do diálogo tem a mesma
moldura do campo de motivo — é o padrão do `TripCancelDialog`, de onde o diálogo foi copiado.

```
bun run typecheck   → limpo
bun run test        → 6187 pass / 0 fail
bun run test:hooks  → 184 pass / 0 fail
```
