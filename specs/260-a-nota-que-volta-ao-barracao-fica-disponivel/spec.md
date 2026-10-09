# Feature 260 — A nota que volta ao barracão fica disponível

## Problema e resultado

Quando uma nota é devolvida numa entrega, ou quando a ocorrência dela termina em "Retornada ao
barracão", ela **não volta a ficar disponível para ser entregue de novo**. Medido no código
(levantamento de 2026-10-09, só leitura):

- `reportDocumentReturn` grava `separation_status='returned'`, `return_reason` e `returned_at` em
  `trip_documents` e **nunca preenche `released_at`**
  (`apps/api-transportada/src/trips/infrastructure/drizzle-driver-field-report.repository.ts:572-589`).
- Todo teste de "nota disponível" olha só `released_at IS NULL`: `cargo-arrival-document.query.ts:26-28`,
  `cte-batch-selection.query.ts:162`, `drizzle-trip-report.repository.ts:160-176`,
  `drizzle-trip.repository.ts` (`linkDocumentsBatch`). Os índices únicos
  `trip_documents_live_nfe_document_unique` e `..._live_freight_calculation_unique`
  (`trip.schema.ts:1013-1018`) também. A nota devolvida segue "viva" na viagem de origem.
- Depois do despacho nem a liberação manual funciona: `checkTripAcceptsLinkage`
  (`trip-state.policy.ts:158-164`) recusa desvincular em viagem despachada, concluída ou cancelada.
- A ocorrência `returned_to_warehouse` é estado da tratativa (`trip_occurrence_cases`) e **não escreve
  em `trip_documents`**, por decisão da spec 164 (RF19, D4: "a nota não é presa").
- A reentrega da spec 164 só roda antes do despacho e depois que o contratante autoriza no portal.

O resultado desta feature:

1. **A nota que volta ao barracão é solta da viagem de origem** e reaparece nas listas de notas
   disponíveis, com o histórico da devolução preservado.
2. **Quem decide se solta é o tipo da ocorrência** (`redeliveryPolicy`, spec 164/242): tipo que
   admite reentrega, com itens sem avaria, solta; tipo bloqueado ou sem política não solta.
3. **O operador transfere carga de uma viagem para outra** num gesto só, sem passar por "soltar e
   montar de novo".
4. **A aba Ocorrências sinaliza** a nota que voltou ao barracão e aguarda nova entrega.

## Fora do escopo

- Reentrega automática: a nota fica disponível, quem monta a viagem seguinte é o operador.
- Mudar a política de reentrega por tipo (spec 242 já entregou o cadastro).
- Devolver mercadoria avariada ao contratante (spec 237 T3.3, módulo `cargo-receiving`).

## Decisões

- D1. **Soltar é `released_at = now()` na linha existente**, nunca apagar nem duplicar a linha:
  `returned_at`, `return_reason` e `separation_status='returned'` ficam como o histórico. A nota
  reaparece como disponível porque os filtros e o índice único já respeitam `released_at`.
- D2. **A política do tipo manda.** Só solta quando `redeliveryPolicy = 'allowed'`. `blocked` e
  `unset` nunca soltam sozinhos; o operador ainda pode soltar à mão onde já pode hoje.
- D3. **Isto reabre a RF19 e a D4 da spec 164** ("nenhuma escrita em `trip_documents` por causa da
  ocorrência"). A mudança é por escrito e restrita: só `released_at`, só na transição para
  `returned_to_warehouse`, só com política `allowed`. `separation_status`, `delivered_at` e
  `returned_at` seguem com os escritores de hoje. A spec 164 ganha uma nota apontando para esta.
- D4. **Transferência é soltar da origem + vincular ao destino, numa transação.** Reusa
  `releaseLiveLink` e `linkDocumentsBatch`; destino precisa aceitar vínculo
  (`checkTripAcceptsLinkage`, incluindo a viagem na rua da spec 257). Falha em qualquer metade
  desfaz as duas. Permissão `trip.manage`; grava trilha de auditoria (ator, origem, destino, hora).
- D5. **A aba Ocorrências mostra o selo "Aguardando nova entrega"** na tratativa
  `returned_to_warehouse` cuja nota foi solta, e um filtro por esse estado.

## [NEEDS CLARIFICATION]

- NC1. **A devolução simples feita pelo motorista na entrega (sem ocorrência) solta a nota?**
  O pedido do usuário fala de "alguns tipos de ocorrência"; não está dito o que acontece com a
  devolução comum. Sem resposta, esta spec cobre **só** o caminho da ocorrência.
- NC2. **Quem confirma "voltou ao barracão"?** Hoje o estado `returned_to_warehouse` é movido pelo
  operador com `occurrences.resolve`. Confirmar que o gatilho do soltar é essa ação humana e não o
  registro do motorista.
