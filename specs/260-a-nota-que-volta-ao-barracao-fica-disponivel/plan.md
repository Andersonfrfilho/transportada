# Plano — Feature 260

## Visão

Um use case novo na API solta a nota quando a tratativa chega a `returned_to_warehouse` com política
`allowed`; uma rota de transferência reusa soltar e vincular numa transação; o painel ganha o gesto
de transferir e o selo na aba Ocorrências.

## Fases

1. **Soltar ao voltar ao barracão (API).** Em `occurrence-case.use-case.ts`, na transição para
   `returned_to_warehouse`, ler `redeliveryPolicy` do tipo e, se `allowed`, soltar a nota por
   `releaseLiveLink` na mesma transação da transição. Contrato negativo: `blocked`/`unset` não soltam;
   `separation_status`/`returned_at` intactos; `GET /trips/:id/allowed-actions` byte a byte igual.
2. **Transferência de carga (API).** `POST /trips/:id/documents/transfer` (`trip.manage`),
   corpo `{ targetTripId, documentIds }`, resposta com o resultado por nota; transação única;
   `Idempotency-Key`; recusa nomeando a nota e o motivo; auditoria.
3. **Painel: transferir.** Ação "Transferir para outra viagem" na seleção de notas do detalhe da
   viagem, com seletor de viagem de destino (só viagens que aceitam vínculo), confirmação e erro por nota.
4. **Painel: aba Ocorrências.** Selo "Aguardando nova entrega" e filtro; leitura derivada
   `awaitingRedelivery` na listagem de casos.
5. **Revisão de design e usabilidade**, com print (web.md §15), e nota de reconciliação na spec 164.

## Riscos

- CHECK `trip_documents_delivered_locks_release_check`: soltar nota entregue é proibido; a regra
  só alcança nota `returned`. Contrato de migration não é necessário (sem coluna nova).
- Outras sessões podem ter 260 em branch; conferir `origin/staging` antes do push.
