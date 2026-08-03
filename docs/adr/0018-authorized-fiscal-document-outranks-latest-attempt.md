# ADR-0018: Documento fiscal gravado manda sobre a última tentativa de emissão

## Contexto

A `T032` (feature 013) descartou os manifestos `4ef75fa1` e `4da262d0` e devolveu os CT-es
`3abe7870` e `fbe957fa` ao pool de candidatos. O `POST /mdfe-manifests/preview` aceitou os dois, mas
a tela de criação de manifesto só oferecia um: o CT-e `3abe7870` não aparecia na lista de candidatos.

O motivo não era a devolução, era a leitura do lote. `GET /cte-batches/:id/items` derivava o status
do item exclusivamente da última linha de `cte_issuance_attempts`, e aquele item tinha uma tentativa
posterior `rejected` sobre um `cte_fiscal_documents` `authorized`. A API dizia `rejected`, o
frontend filtrava por `authorized` e o CT-e sumia — enquanto a elegibilidade do MDF-e, que lê o
documento fiscal, continuava aceitando o mesmo CT-e.

Duas leituras do mesmo fato, discordando. Uma delas atende a tela de manifesto, a outra atende a
tela do lote, e o operador via um CT-e autorizado que não podia manifestar.

## Decisão

**Existindo `cte_fiscal_documents` para o item, ele é a fonte da verdade sobre o estado fiscal do
CT-e.** A última tentativa só responde pelo item enquanto não houver documento gravado.

O documento só nasce quando a SEFAZ autoriza e o worker faz o write-back. A partir daí o CT-e existe
com chave e protocolo, e nada que aconteça depois numa tentativa o desautoriza: quem desfaz
autorização é o evento 110111, que o próprio documento registra em `cancellation_requested_at` /
`status`. Uma tentativa `rejected` ou `failed` posterior é ruído de processo — reprocessamento
disparado por engano, replay recusado por duplicidade — e não pode apagar da tela um documento
fiscal válido.

A regra vira uma política pura, `src/cte-issuance/domain/cte-fiscal-document-status.policy.ts`,
consumida pelos dois leitores (`drizzle-cte-batch-item.repository.ts` e
`drizzle-cte-issuance.repository.ts`). Antes ela existia só dentro do repositório de emissão, e por
isso não alcançava a listagem do lote.

A alternativa descartada era corrigir só o dado: apagar a tentativa recusada daquele item em
homologação. Isso resolveria a tela de hoje, mentiria sobre o histórico fiscal — que pelo princípio 5
da constituição não se sobrescreve — e deixaria o próximo reprocessamento acidental reproduzir o
mesmo sumiço.

## Consequências

- Um item com documento autorizado e tentativa posterior recusada passa a aparecer como
  `authorized`: ganha download e cancelamento na tela do lote, e deixa de oferecer "reprocessar" —
  reemitir CT-e já autorizado duplicaria documento fiscal.
- Cancelamento continua vindo do documento, inclusive quando só existe `cancellation_requested_at`.
- Item sem documento não muda em nada: segue exibindo o status da última tentativa, e `pending`
  quando não há tentativa alguma.
- A divergência inversa — documento gravado sem tentativa correspondente — não é tratada aqui porque
  não pode acontecer: `cte_fiscal_documents.attempt_id` é `not null`.
