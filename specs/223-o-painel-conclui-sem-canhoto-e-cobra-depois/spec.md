# Feature 223 — O painel conclui sem canhoto, e cobra depois

## Problema e resultado

Transportadora parada: a viagem **não fecha** no painel quando a configuração da empresa exige foto
do canhoto e a foto não existe. O escritório tem a informação na mão — falou com o motorista, falou
com o cliente, a mercadoria está entregue — e não consegue registrar isso em lugar nenhum.

Três medições feitas no código de `origin/staging`, que delimitam o defeito:

1. **A viagem inteira já fecha sem canhoto.** `POST /trips/:id/close` não consulta configuração de
   comprovante nenhuma (`trip.routes.ts:1262`). Quem recusa é o eixo da **nota**, não o da viagem.
2. **A nota é o bloqueio.** A baixa do escritório sem arquivo chega como `receiver === null`
   (`tripClient.service.ts:720` monta o `FormData` sem foto) e
   `assertOfficeProofMeetsSettings` lança 422 `PHOTO_REQUIRED` quando `photo = required` **ou**
   `signature = required` (`office-delivery-proof.policy.ts:47-57`). Enquanto a nota não baixa, a
   parada não fecha, e a viagem não se conclui sozinha (spec 056 D1).
3. **A pendência já existe e é assimétrica.** No caminho do motorista a mesma situação **não**
   recusa: a entrega passa e a resposta avisa `proofPending: true`
   (`document-outcome-proof.service.ts:resolveProofPendingFlag`, ADR-0070 §1, provado em
   `office-field-delivery.contract.ts:357`). O escritório é o único ator recusado.

Resultado desta feature:

- **A nota baixa sem canhoto pelo painel**, com qualquer configuração, e nasce com a pendência.
- **Em massa**: um maço de notas baixa de uma vez, e a lista de viagens encerra várias viagens de
  uma vez.
- **A pendência é visível**: selo na linha da nota no detalhe da viagem e filtro na lista de viagens.
  O canhoto deixa de ser gate de entrada e passa a ser dívida rastreada.

## Decisão de escopo (do usuário, 2026-10-01)

- **Só o painel** (`apps/frontend-transportada`). O app do motorista não muda nesta feature.
- Com `photo = required`, o painel **não bloqueia**: a viagem conclui e o canhoto fica como
  pendência para subir depois.
- A pendência aparece como **selo na nota + filtro nas viagens**.

## Conflito declarado com a spec 218

A spec 218 ("o motorista não escapa do comprovante") move o **motorista** no sentido oposto: barrar
"Entreguei" sem canhoto quando `required`. Ela está escrita e **não implementada**. As duas convivem
sem contradição de código, mas com uma consequência que fica registrada aqui: com o painel
concluindo livremente, o escritório é a saída para a regra da 218. É por isso que o selo e o filtro
desta feature **não são enfeite** — eles são o mecanismo que faz o canhoto ser cobrado depois. Sem
eles, a 223 vira um modo de nunca coletar canhoto.

## Requisitos funcionais

### API

- **RF1** — A baixa de entrega do escritório **sem arquivo** é aceita com qualquer configuração de
  `photo` e `signature`. `assertOfficeProofMeetsSettings` deixa de lançar `PHOTO_REQUIRED` no ramo
  `receiver === null`.
- **RF2** — As validações que **não** são "faltou arquivo" continuam de pé: comprovante **enviado**
  com `signature = required` e sem nome segue 422 `RECEIVER_NAME_REQUIRED`; documento do recebedor
  com `receiverDocument = off` segue recusado (ADR-0057 §1).
- **RF3** — `resolveProofPendingFlag` passa a considerar **`signature = required`** além de
  `photo = required`. Sem isso, uma empresa que exige assinatura e não foto passaria a baixar sem
  canhoto **e sem pendência** — o canhoto desapareceria em silêncio.
- **RF4** — A pendência de canhoto é legível **fora** da resposta da baixa: no detalhe da viagem,
  por nota, e como filtro na lista de viagens. A fonte é a coluna persistida `canhoto_review`
  (specs 220/222) somada à ausência de foto — nenhum conceito paralelo de pendência é criado.
- **RF5** — Nada de novo endpoint de lote: o `batch-status` segue restrito a `load|separate`
  (`trip-request.schema.ts:70`, remoção deliberada da spec 156 T8b). O lote é leque do painel.

### Painel

- **RF6** — Botão "Marcar entregue" por nota, no detalhe da viagem. A mutação já existe e nunca foi
  chamada (`useTripWorkspace.hook.ts:792`, exportada em `:929`); a chave de tradução já existe e
  está órfã (`trip.locale.json:6`).
- **RF7** — "Marcar entregue" **em massa** sobre a seleção de notas, pelo leque
  `runFieldActionQueue({ concurrency: 3 })` com `Idempotency-Key` por nota e falha isolada — o mesmo
  molde do `batchFieldReturnMutation` (`useTripWorkspace.hook.ts:813-843`). Nota que falha volta
  para a seleção (`selection.replace(falhas)`), como em `handleBatchReturn`.
- **RF8** — "Encerrar viagem" **em massa** na lista de viagens, pelo mesmo leque sobre
  `POST /trips/:id/close`. Hoje o botão existe uma viagem por vez e só no detalhe
  (`TripDetail.component.tsx:1166`).
- **RF9** — Selo "canhoto pendente" na linha da nota e filtro "com canhoto pendente" na lista de
  viagens.
- **RF10** — Permissão: as ações do escritório seguem `trip.report-on-behalf` (baixa em nome do
  motorista) e o encerramento segue o gate atual (`canCloseTrip`). Nenhuma permissão nova.

## Fora de escopo

- Qualquer mudança em `apps/frontend-driver` ou no caminho do motorista na API.
- Implementar a spec 218.
- Reabrir `batch-status` para novos estados.
- Notificação ativa (e-mail/push) de canhoto pendente.

## Riscos

| Risco                                          | Mitigação                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| Escritório vira a saída da regra da 218        | Selo + filtro (RF9) tornam a dívida visível; registrado no ADR-0091 |
| Baixa sem pendência com `signature = required` | RF3, com teste de contrato próprio                                  |
| Lote parcial deixa a tela mentindo             | Falha isolada + `selection.replace(falhas)` (RF7)                   |
| Quatro testes fixam o 422 de hoje              | Invertidos na mesma task da policy, nunca apagados                  |

## Rastro

- ADR-0091 (decisão e a assimetria escritório/motorista)
- Specs lidas antes de escrever esta: 156 (T6/T8b/T15), 159 (RF1/RF2), 184 (RF4), 218, 220, 222
- ADRs: 0057 §1, 0067 §3/§5, 0070 §1
