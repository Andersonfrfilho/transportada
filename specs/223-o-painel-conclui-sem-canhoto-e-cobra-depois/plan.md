# Plano — Feature 223

## Ordem

A fase 1 é a que destrava a operação: sem ela, nenhum botão do painel resolve nada, porque a API
recusa. As fases 2 e 3 são o painel. A fase 4 é a cobrança (selo e filtro), que é o que impede a
feature de virar "nunca mais coletar canhoto".

## Fase 1 — A API aceita a baixa sem canhoto (RF1, RF2, RF3) — **concluída**

- `assertOfficeProofMeetsSettings` (`src/trips/domain/office-delivery-proof.policy.ts`): o ramo
  `receiver === null` passa a aceitar. As validações do comprovante **enviado** ficam.
- `resolveProofPendingFlag` (`src/trips/application/document-outcome-proof.service.ts`): conta
  `signature = required` além de `photo = required`.
- `resolveOutcomeProofSettings`: a pendência passa a sair da configuração do escritório que já foi
  resolvida, sem depender de o canal também mandar `resolveProofSettings`.
- `trip-field-office-document.routes.ts`: a resposta da baixa expõe `proofPending`.
- `TripDeliveryProofPhotoRequiredError` + o mapeamento do painel saem (código morto).

Risco coberto: os dois testes que fixavam o 422 foram **invertidos**, não apagados.

## Fase 2 — A nota baixa pelo painel, uma e em massa (RF6, RF7)

A mutação `fieldDeliverDocumentMutation` já existe (`useTripWorkspace.hook.ts:792`) e nunca foi
chamada; a chave `actions.deliver` já existe no locale e está órfã. Falta o botão e o leque.

O molde do lote é o `batchFieldReturnMutation` (`:813-843`) com `runFieldActionQueue`
(`tripFieldActionQueue.service.ts`), concorrência 3, `Idempotency-Key` por nota, falha isolada e
`selection.replace(falhas)` como em `handleBatchReturn` (`TripDetail.component.tsx:570-595`).

Nada de endpoint novo: `batch-status` fica como está (RF5).

## Fase 3 — A lista de viagens encerra em massa (RF8)

`POST /trips/:id/close` já existe e já não pede canhoto. Falta seleção de linhas na lista de viagens
e o leque sobre as selecionadas, com o mesmo tratamento de falha parcial.

## Fase 4 — A dívida fica visível (RF4, RF9)

Selo "canhoto pendente" na linha da nota no detalhe e filtro na lista de viagens, sobre
`canhoto_review` (specs 220/222) — sem criar conceito paralelo de pendência.

## Fase 5 — Revisão de design e usabilidade

Fecha com print da tela, conforme a regra do repositório para toda spec com UI.

## Gates por task

`bun run typecheck`, os contratos do que foi tocado, e — para task que mexe em
`test/integration/**` — `bun --env-file=../../.env.test run test:integration` com Postgres de pé.
Commit isolado por task.
