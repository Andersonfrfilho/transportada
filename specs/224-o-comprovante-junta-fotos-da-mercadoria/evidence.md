# Evidence — Feature 224

Cada task registra aqui: comando, contagem de testes (contrato e integração separados), commit e,
na UI, os prints. Relatório de agente não é evidência: conferir o `git log` antes de marcar.

## Escrita da spec (2026-09-26)

- Numeração: nasceu 211 (livre em 2026-09-26) e foi **renumerada para 224 em 2026-10-02**, porque
  staging publicou `211-o-nucleo-de-conversa-ganha-o-e-mail` no intervalo. A ADR é a 0089, livre em
  `origin/staging` junto com 0086 e 0087.
- Conferido contra o código, antes de escrever:
  - o índice `trip_delivery_proofs_company_event_kind_unique` é parcial `where kind <> 'cargo'`
    (`trip.schema.ts:1542-1544`), e os dois upserts repetem o predicado;
  - só o escritório grava `cargo`. A rota do motorista recusa por `DRIVER_PROOF_KINDS`
    (`delivery-event.constant.ts:25-30`);
  - o teto de 5 da 184 é contado sem trava (`office-delivery-proof.service.ts:137-141`);
  - a pontualidade classifica só `photo` (`attach-delivery-proof.use-case.ts:324-325`), e a nota e
    as pendentes filtram `photo` (`drizzle-driver-score.repository.ts:304`,
    `drizzle-current-driver-trip.repository.ts:436` e `:649`);
  - o comprovante não tem retenção. `OCCURRENCE_ATTACHMENT_RETENTION_YEARS = 5`
    (`occurrence-attachment.policy.ts:44`), com expurgo do worker só para os purposes da ocorrência;
  - a leitura do painel não filtra estado (`delivery-proof-read.support.ts:68-122`), e
    `isDeliveryProof` já aceita `cargo` e filtra item estranho (`tripResponse.validation.ts:803-806`
    e `:1130-1156`);
  - a fila do aparelho: `kind` só `photo | signature`, teto 30 / 50 MB, sem evicção, drenagem na
    ordem de `readAll()` (`offlineAttachments.service.ts:14-17`, `:102-108`, `:311-450`);
  - o CORS libera só `Authorization` em `GET`/`DELETE`/`HEAD` (`cors.service.ts:20-21,74`), e o
    `request()` da app não aceita `DELETE` (`driverTripClient.service.ts:650-662`);
  - a CSP da app tem `img-src 'self' blob: <API>` (`contentSecurityPolicy.service.ts:66`);
  - `ProofImageLightbox` e `removeQueuedAttachmentByKey` existem (`8f01f00e8`), e a redução e a
    recuperação do canhoto vêm da 212 (`0bf0b57e4`, `ae6ea9977`, `fb063406d`).

## Revisão 1 (2026-09-26)

A crítica (opus) reprovou a primeira versão (REVISE). O usuário decidiu que a foto de produto
removida é apagada de verdade, e aceitou o risco registrado na ADR-0089. O que mudou:

- **C1:** o `DELETE` vai só com `Authorization`, com contrato do preflight e do cliente.
- **M2:** o trigger faz trava, curto-circuito pela chave e contagem em comandos separados, e o
  23514 relê pela chave antes de virar 422.
- **M4:** os campos de quem recebeu e o GPS ficam fora de `cargo`.
- **M5:** "Ver" depois de recarregar, pela rota de conteúdo; "Substituir" no canhoto enviado.
- **M6:** a drenagem é feita em duas passagens globais.
- **M7:** os bytes vêm pela API, e a RNF1 foi corrigida.
- **M8:** o OpenAPI saiu, e o assert da migration entrou antes da T1.3.
- **Menores:**
  - filtro de `status` na leitura do painel;
  - "N de 4" vindo do servidor;
  - a remoção na fila é descontada da lista;
  - a galeria também em `DriverPendingProofs`;
  - `NOT VALID` + `VALIDATE` no purpose;
  - `removed_by_user_id` sem FK;
  - plano de correção para frente;
  - `runWithStoredObjectCleanup` no upload e chave obrigatória;
  - teto de 9 fotos por entrega explícito;
  - tabela de coordenação com a 205, a 206, a 207 e a 212;
  - aceites verificáveis na T1.1, na T4.0 e na T6.1;
  - comportamento do HEIC.

## Fase 0

## Fase 1

## Fase 2

## Fase 3

## Fase 4

## Fase 5

## Fase 6
