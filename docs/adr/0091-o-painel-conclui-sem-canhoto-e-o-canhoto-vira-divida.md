# ADR-0091 — O painel conclui sem canhoto, e o canhoto vira dívida

- **Status**: aceita
- **Data**: 2026-10-01
- **Contexto da decisão**: spec 223

## Contexto

A configuração de comprovante da empresa tem três estados por campo (`required | optional | off`,
ADR-0057). Com `photo = required`, a baixa de entrega feita **pelo escritório** sem arquivo é
recusada com 422 `PHOTO_REQUIRED` em `assertOfficeProofMeetsSettings`
(`src/trips/domain/office-delivery-proof.policy.ts`). Como a parada só fecha quando nenhuma nota
está pendente, e a viagem só se conclui quando a última parada fecha (spec 056 D1, spec 057 P1), a
viagem inteira fica presa pela falta de uma foto.

Três fatos medidos em `origin/staging` antes de decidir:

1. O encerramento da viagem (`POST /trips/:id/close`) **nunca** consultou configuração de
   comprovante. O bloqueio é no eixo da nota, não no da viagem.
2. O mesmo cenário **não** recusa o motorista: a entrega passa e a resposta avisa
   `proofPending: true` (ADR-0070 §1). A recusa é exclusiva do escritório.
3. `resolveProofPendingFlag` deriva a pendência só de `photo = required`, enquanto a policy recusa
   por `photo` **ou** `signature`.

A transportadora fica sem caminho: ela sabe que a mercadoria foi entregue e não tem onde registrar.

## Decisão

**O canhoto deixa de ser condição de entrada da baixa pelo escritório e passa a ser dívida
rastreada.**

1. `assertOfficeProofMeetsSettings` deixa de lançar `PHOTO_REQUIRED` quando nenhum comprovante foi
   enviado. O ramo `receiver === null` passa a aceitar.
2. O que é validação do comprovante **enviado** continua intacto: `RECEIVER_NAME_REQUIRED` com
   `signature = required` sem nome, e recusa do documento do recebedor com `receiverDocument = off`.
3. `resolveProofPendingFlag` passa a cobrir `signature = required` além de `photo = required` — a
   simetria com o que a policy recusava é obrigatória, ou a baixa passa sem gerar pendência e o
   canhoto some sem rastro.
4. A pendência fica **visível fora da resposta da baixa**: selo por nota no detalhe da viagem e
   filtro na lista de viagens, sobre a coluna já persistida `canhoto_review` (specs 220/222).
5. O lote é **leque do painel** (`runFieldActionQueue`, concorrência 3, `Idempotency-Key` por nota,
   falha isolada), não endpoint novo. O `batch-status` segue restrito a `load|separate` — a remoção
   da spec 156 T8b foi deliberada e não se reabre aqui.

## Consequências

**Aceitas.**

- O escritório passa a ser a saída para a regra que a spec 218 quer impor ao motorista (barrar
  "Entreguei" sem canhoto). Com a 223 no ar, quem não quiser coletar canhoto consegue baixar pelo
  painel. É por isso que o selo e o filtro não são enfeite: eles são o mecanismo de cobrança que
  sobra. Se a 218 for implementada, a assimetria é intencional e documentada aqui, não um furo.
- A nota pode existir `delivered` sem comprovante mesmo com a empresa exigindo foto. O estado
  "entregue sem canhoto" passa a ser um estado normal do sistema, com nome e com filtro.

**Rejeitadas.**

- _Permissão nova para "concluir sem canhoto"_: criaria um papel a mais para resolver um problema
  de operação cotidiana. O escritório já tem `trip.report-on-behalf`.
- _Reabrir `batch-status`_: desfaria a spec 156 T8b sem necessidade; o leque do painel já é o padrão
  das outras ações em massa.
- _Conceito novo de pendência_: `canhoto_review` já é persistida e já tem tela (`/pendencias`,
  spec 222). Um segundo conceito criaria duas verdades sobre a mesma dívida.
