# Tasks — Feature 224 (o comprovante junta fotos da mercadoria)

Uma task por vez, na ordem. Cada teste de contrato entra **antes** da implementação e é visto falhar.
Cada task fecha com typecheck, testes e commit isolado (`--no-verify` com caminhos explícitos, porque
o pre-commit varre a árvore), com evidência em `evidence.md`.

Na API, de dentro de `apps/api-transportada`, rodar **os dois comandos** (nenhum cobre o outro):

```bash
bun --env-file=../../.env.test test --timeout 120000   # contrato
bun --env-file=../../.env.test run test:integration    # integração — sem a flag ela PULA
```

Todo arquivo de teste novo entra **à mão** na lista explícita do `package.json` da app (`test` ou
`test:integration`). Se não entrar, não roda.

## Fase 0 — O painel tolera `channel` antes da API

> 🤖 Modelo: `haiku`

- [ ] **T0.1** Contrato vermelho na suíte de `tripResponse.validation` do painel:
  - item com `channel` (`driver_app`, `office` ou `whatsapp`) passa;
  - item sem `channel` passa;
  - item com `channel` desconhecido sai sozinho, sem derrubar a lista (molde `694de05b5`, 193 T3.1).
- [ ] **T0.2** Pôr `channel` em `DELIVERY_PROOF_OPTIONAL_KEYS` e `isOneOf` em `isDeliveryProof`.
  - Gate: `bun run --cwd apps/frontend-transportada test` e `bun run typecheck`.
  - Publicar **antes** da Fase 2.

## Fase 1 — O banco guarda a foto de produto, com teto, chave e lápide

> 🤖 Modelo: 🧠 `opus`

- [ ] **T1.1** Mapear o que a mudança toca. O `evidence.md` registra quatro listas, cada item com
      `arquivo:linha`:
  1. todo `onConflict` sobre `trip_delivery_proofs`;
  2. toda leitura da tabela, marcando qual precisa de `removed_at is null` e qual precisa de
     `status <> 'deleted'`;
  3. todo uso de `TRIP_DELIVERY_PROOF_CARGO_LIMIT`;
  4. toda transação do caminho do comprovante que mexe em isolamento (esperado: nenhuma).

  O `evidence.md` também traz as duas consultas **somente leitura** que o usuário roda em produção
  (Postgres-Hqfu): `cargo` com `attachment_key` duplicada e `cargo` com chave vazia.

  **Aceite:** as quatro listas, as duas consultas e o resultado delas, informado pelo usuário, estão
  no `evidence.md`. Se houver duplicata, a T1.3 para e pergunta.

- [ ] **T1.2** Contratos vermelhos antes da migration.
  - `test/trip-delivery-proof-cargo/schema.contract.ts`, sob o entrypoint novo
    `test/trip-delivery-proof-cargo.contract.test.ts`, que entra no script `test`. Ele confere:
    - colunas, CHECKs e índices no schema TS;
    - que o `migration.sql` tem o trigger com trava, `IF EXISTS` e `count` **em comandos
      separados**, e os `CONSTRAINT` nomeados;
    - que os tetos do SQL são iguais a `DRIVER_CARGO_PHOTO_LIMIT` e `TRIP_DELIVERY_PROOF_CARGO_LIMIT`;
    - `NOT VALID` + `VALIDATE` no purpose;
    - que o `rollback.sql` recusa depois do primeiro uso.
  - Assert `database-migration/delivery-proof-cargo-driver.assertion.ts`, chamado por
    `database-migration.integration.ts`. Ver falhar em `make migration-test`.
- [ ] **T1.3** Escrever o schema, a migration aditiva à mão, o `snapshot.json` e o `rollback.sql`
      (plan.md, "Dados, migration e rollback").
  - Fecha com `make migration-test` verde, com o assert da T1.2. **`make check` não cobre
    migration.**
  - Fecha também com `db:generate` = `no_changes`.
- [ ] **T1.4** Integração vermelha, depois verde, em
      `test/integration/delivery-proof-cargo-driver.integration.ts`, incluída no `test:integration`:
  - 4 `cargo` de `driver_app` passam, e a quinta dá 23514 com o nome da constraint;
  - o escritório grava 5 no mesmo evento, 9 no total (CA02);
  - duas transações na quinta foto, com chaves diferentes: passa uma;
  - duas transações na quarta foto, com a mesma chave: uma linha e 23505, nunca 23514 (CA03);
  - `cargo` com chave vazia é recusada;
  - `removed_at` não volta a `null`, e remover `photo` ou `office` é recusado;
  - uma remoção libera uma vaga.

## Fase 2 — A API recebe, lista, mostra e apaga

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** Contratos vermelhos em `test/trip-delivery-proof-cargo/`.
  - `driver-upload.contract.ts` (CA04, CA05):
    - `cargo` aceita;
    - chave ausente dá 400;
    - a quinta dá 422, tanto na pré-contagem quanto pela tradução da constraint;
    - 23514 com a linha da chave já gravada dá 201;
    - acima de 512 KiB e cabeçalho falso são recusados;
    - recebedor, posição e `lateRegistration` são descartados, com `not_required`;
    - a lápide é devolvida no reenvio;
    - `runWithStoredObjectCleanup` apaga o objeto quando a transação desfaz.
  - `driver-routes.contract.ts` (CA07, CA08):
    - os dois `GET` e o `DELETE`;
    - `DELETE` repetido três vezes dá 204 com uma auditoria só;
    - chave alheia dá 204 sem efeito;
    - nota fora do alcance dá 404;
    - `content` de foto alheia ou removida dá 404;
    - `cargo.used` conta o canal inteiro;
    - `trip.report` e rate limit.
  - `office-count.contract.ts`: a contagem do escritório filtra o canal.
  - Na suíte de CORS que já existe: o preflight de `DELETE` só com `Authorization` passa (CA09).
- [ ] **T2.2** Upload `cargo` do motorista: `DRIVER_PROOF_KINDS`, `driver-cargo-proof.service.ts`, o
      desvio antes da classificação, `insertCargoProof` com as duas releituras, o purpose novo e
      5 anos de retenção (RF1, RF6). No escritório: contagem por canal, purpose e retenção.
- [ ] **T2.3** `me-driver-proof.routes.ts`, com os três casos de uso (RF2 a RF4).
  - Remoção:
    - na transação: lápide, auditoria e `retention_until = now()`;
    - depois do commit: `deleteObject` e `status = 'deleted'`;
    - se o bucket falhar, a resposta continua 204 e o log registra `storage_delete_deferred`.
  - `listDeliveryProofs` passa a filtrar lápide e `status`, e a devolver `channel` (RF7).
- [ ] **T2.4** Registrar a D11 no `evidence.md`: nenhuma rota nova devolve URL do bucket ao motorista,
      e a app não faz `GET` ao storage. Conferir com `grep` de `downloadUrl` e da origem do storage
      em `apps/frontend-driver/src`. Se alguém quiser voltar à URL assinada, antes é preciso
      conferir o CORS de `GET` do bucket para `motorista.<zona>` em staging e produção, com a
      evidência da resposta do preflight. Essa conferência fica registrada como condição.
- [ ] **T2.5** Worker: o purpose novo no expurgo (RF6). Contrato na suíte
      `test/trip-occurrence-attachment-purge/`:
  - o `delivery_proof_cargo` vencido é apagado;
  - o `delivery_proof` nunca é (CA10);
  - a linha dona do objeto continua.

  Gate: `bun run --cwd apps/worker-transportada test` e a integração do expurgo.

- [ ] **T2.6** Integração dos casos novos: upload, os dois `GET`, `DELETE`, lápide, auditoria, bytes
      apagados do dublê e regressão da nota (CA06) em `driver-score.integration.ts` e
      `me-trip.integration.ts`. **Só fecha com `bun --env-file=../../.env.test run test:integration`
      verde**, com a contagem no `evidence.md`.
- [ ] **T2.7** Documentação viva:
  - `apps/api-transportada/CLAUDE.md`: a foto de produto do motorista, o teto por canal no trigger, a
    lápide, o `DELETE` sem `Idempotency-Key` e a retenção;
  - `docs/SECURITY.md`: a LGPD da foto de produto e o risco aceito;
  - a ADR-0089 passa a `aceita`.

## Fase 3 — A fila do aparelho leva a foto de produto sem tirar lugar do canhoto

> 🤖 Modelo: `sonnet`

- [ ] **T3.1** Contratos vermelhos.
  - `test/driver-trip/cargo-photo-queue.contract.ts` (CA11, CA12):
    - `canAcceptCargoPhoto` recusa com 8 `cargo`, com 21 itens e com 30 MiB, e o canhoto ainda
      entra;
    - as duas passagens: canhotos de todas as notas antes de qualquer `cargo`, e uma falha de rede
      numa `cargo` não deixa canhoto para trás;
    - `cargo` recusado grava `rejectionCause` e não segura o resto;
    - `applyAttachmentReceiverFields` e `detectReceiverDrift` ignoram `cargo`;
    - o item `cargo` não tem posição;
    - a `replaceQueuedProof` da 194, se existir, nunca apaga `cargo`;
    - a recuperação da 212 usa 512 KiB em `cargo` e 960 KiB no canhoto;
    - HEIC que falha na redução sobe o original.
  - `test/driver-trip/driver-trip-client-delete.contract.ts`: `request()` aceita `'DELETE'`, o
    `DELETE` sai sem `idempotency-key`, 204 tira o `cargoPhotoRemoval` da fila, e erro de rede
    mantém o evento.
- [ ] **T3.2** Implementar: `offlineAttachments.service.ts`, `cargoPhotoQueue.constant.ts`, a régua
      por `kind` na redução e na recuperação, o cliente (`request` com `DELETE`, `listDriverProofs`,
      `readDriverProofContent`, `removeCargoProof`, `attachProof` com `cargo`),
      `driverProofListFromApi` e o evento `cargoPhotoRemoval`. Gate:
      `bun run --cwd apps/frontend-driver check`.

## Fase 4 — A tela: fotos dos produtos, ver, remover e substituir

> 🤖 Modelo: `sonnet`

- [ ] **T4.0** Pré-requisitos. O `evidence.md` registra a saída de três comandos:
  - `git log --oneline -5 origin/staging -- apps/frontend-driver/src/modules/driver-trip/components/DriverStopCard.component.tsx`;
  - `git log --oneline -1 origin/staging -- apps/frontend-driver/src/modules/driver-trip/components/ProofImageLightbox.component.tsx`;
  - `grep -n "removeQueuedAttachmentByKey" apps/frontend-driver/src/modules/driver-trip/shared/offlineAttachments.service.ts`.

  **Aceite:** os três aparecem em `origin/staging`. Se faltar algum, parar e avisar, sem criar outro
  (D10). Também listar os commits da 194, 206 e 207 no cartão desde `8f01f00e8`.

- [ ] **T4.1** Contratos vermelhos em `test/driver-trip/cargo-photo-gallery.contract.ts` (CA13):
  - miniaturas de 0 a 4, "N de 4" vindo de `cargo.used` mais a fila, e sem "Adicionar" em 4;
  - a remoção pendente sai da lista;
  - "Substituir" o canhoto não mexe nas fotos de produto;
  - "Remover" pede confirmação: na fila chama `removeQueuedAttachmentByKey`, e enviada enfileira
    `cargoPhotoRemoval`;
  - "Ver" usa o `ProofImageLightbox` no canhoto, na assinatura e nos produtos, também depois de
    recarregar, pelos bytes da API;
  - a seção também aparece em `DriverPendingProofs`;
  - fila cheia mostra `cargoPhotoQueueFull` com `role="status"`;
  - `captureRegistry`;
  - alvos de pelo menos 44 px.
- [ ] **T4.2** Implementar:
  - `useDriverProofImages.hook.ts`;
  - `CargoPhotoGallery.component.tsx` e `.module.css`;
  - a montagem no `DeliveryProofSection`;
  - "Ver" e "Substituir" no canhoto e na assinatura enviados;
  - locale pt-BR e en.

  Gate: `bun run --cwd apps/frontend-driver check`.

- [ ] **T4.3** Smoke em `test/driver-app.smoke.spec.ts`, na porta 53112, sem tocar 53200 nem 53901,
      em primeiro plano. Roteiro: adicionar 2, ver, fechar, remover da fila, remover enviada,
      recarregar e ver o canhoto.
- [ ] **T4.4 👤** Preview local.
  - A `motorista-api-demo` (53901, `driver-preview-api.ts` no scratchpad, pelo
    `.claude/launch.json`) ganha as rotas novas em memória, com teto de 4, 204 idempotente e o
    `content`. A `motorista-local` sobe na 53200.
  - Antes, conferir de quem são as portas.
  - Prints em 375 e 768 px em `prints/`, destes estados: vazio; 2 fotos, uma na fila e uma enviada;
    4 de 4; confirmação de remover; visualizador; canhoto enviado com "Ver" e "Substituir"; fila
    cheia; recusada pelo limite.
  - Mostrar ao usuário, com a posição da seção (Q2), e esperar o **"pode subir"**.

## Fase 5 — O painel mostra as fotos dos produtos

> 🤖 Modelo: `haiku`

- [ ] **T5.1** Contrato: `deliveryProof.service` agrupa `cargo` com a origem, e sem `channel` omite a
      origem (CA14).
- [ ] **T5.2** Em `TripDeliveryProof.component.tsx`, o rótulo "Fotos dos produtos" e a origem (D12).
      Preview do painel com prints em 1280 e 375 px.

## Fase 6 — Revisão de design, segurança e publicação

> 🤖 Modelo: 🧠 `opus`

- [ ] **T6.1** Revisão de design e usabilidade (`designer`). Olhar os estados da T4.4 em 375 e
      768 px, claro e escuro: contraste AA medido, alvos de pelo menos 44 px medidos por
      `javascript_tool`, e a ordem canhoto → quem recebeu → produtos → concluir.

  **Aceite:** o `evidence.md` tem a tabela de achados, cada um com severidade e "corrigido em
  `<hash>`" ou "registrado em `<arquivo>`". Nenhum achado alto fica aberto.

- [ ] **T6.2** Revisão de segurança (`security-reviewer`), cobrindo:
  - BOLA nos dois `GET` e no `DELETE`, sem oráculo;
  - preflight de CORS;
  - assinatura de bytes;
  - nenhuma PII ou posição em log;
  - bytes apagados de verdade;
  - auditoria;
  - §15 do code-standart.
- [ ] **T6.3** Atualizar `apps/frontend-driver/CLAUDE.md`: a galeria, a reserva da fila, as duas
      passagens, o `DELETE` sem header e a leitura pela API.
- [ ] **T6.4** Publicar em staging, com os passos encadeados por `&&`:
      `git fetch && git rebase origin/staging && bun install --frozen-lockfile && make check && make migration-test && git push origin HEAD:staging`.
  - Antes do push: prettier nos `.md` e `db:generate` = `no_changes`.
  - Produção só com aprovação humana.

## Preview

App do motorista, nota entregue, 375 px:

```text
┌──────────────────────────────────────┐
│ NF-e 1234 · Mercado Bom Preço     ok │
├──────────────────────────────────────┤
│ Canhoto                              │
│ [foto]  enviado                      │
│         [Ver] [Substituir]           │
│ [Colher assinatura]                  │
├──────────────────────────────────────┤
│ Quem recebeu                         │
│ [O próprio cliente recebeu]          │
│ Relação [Recepção            v]      │
│ Nome    [Maria S.             ]      │
├──────────────────────────────────────┤
│ Fotos dos produtos (opcional) 2 de 4 │
│ [foto 1]         [foto 2]            │
│  na fila          enviada            │
│ [Ver][Remover]   [Ver][Remover]      │
│ [Adicionar foto] [Anexar]            │
├──────────────────────────────────────┤
│ [            Concluir            ]   │
└──────────────────────────────────────┘
```

Canhoto ainda na fila:

```text
┌──────────────────────────────────────┐
│ Canhoto                              │
│ [foto]  na fila                      │
│         [Ver] [Remover]              │
└──────────────────────────────────────┘
```

Remover a foto de produto enviada:

```text
┌──────────────────────────────────────┐
│ Remover esta foto?                   │
│ Ela é apagada do comprovante e não   │
│ pode ser recuperada.                 │
│          [Cancelar] [Remover]        │
└──────────────────────────────────────┘
```

Ver (`ProofImageLightbox`):

```text
┌──────────────────────────────────────┐
│                            [Fechar]  │
│                                      │
│          foto em tela cheia          │
│                                      │
└──────────────────────────────────────┘
```

Fila cheia e limite:

```text
┌──────────────────────────────────────┐
│ A fila está cheia. Envie as          │
│ pendências e tente de novo. O        │
│ canhoto tem prioridade.              │
├──────────────────────────────────────┤
│ [foto 5]  recusada: limite de 4      │
│ [Ver] [Remover]                      │
└──────────────────────────────────────┘
```

Painel, comprovante da nota:

```text
┌──────────────────────────────────────┐
│ Canhoto            Assinatura        │
│ [img]              [img]             │
│ Maria S. · Recepção                  │
│ Fotos dos produtos                   │
│ [img]      [img]      [img]          │
│ Motorista  Motorista  Escritório     │
└──────────────────────────────────────┘
```

## Pendências antes do prompt de execução

Esta spec **não tem prompt de autopilot** enquanto houver `[NEEDS CLARIFICATION]` aberto
(regra do ecossistema). Pendente, em 2026-10-02:

1. **O teto da foto de produto conflita com a spec 220 RF08.** Esta spec decidiu 4 por canal no
   motorista e 5 no escritório, somando **9 por entrega** (D3, deliberado: dois autores). A 220,
   publicada depois, diz que **o teto continua 5 por entrega** (spec 184 D3) e valida o
   `cargo_minimum_count` contra ele. Decidir qual vale antes da Fase 1 — é ela que escreve o
   trigger, e um trigger de 4+5 faria o mínimo da 220 validar contra teto que o banco não aplica.

Resolvido isso, o prompt abaixo volta a valer (a Fase 1 depende da decisão):

<!-- prompt suspenso até a pendência 1 fechar


```text
/oh-my-claudecode:autopilot Execute a spec specs/224-o-comprovante-junta-fotos-da-mercadoria/
(leia spec.md, plan.md, tasks.md e a ADR-0089 antes de começar). Uma task por vez, na ordem do
tasks.md, cada uma com o contrato vermelho antes da implementação.
Modelos: Fase 0 → executor model=haiku · Fase 1 🧠 → opus (migration, trigger, rollback) ·
Fase 2 → executor model=sonnet · Fase 3 → executor model=sonnet · Fase 4 → executor model=sonnet ·
Fase 5 → executor model=haiku · Fase 6 🧠 → opus (designer e security-reviewer) ·
revisão final → code-reviewer model=opus.
Cada task fecha com typecheck + testes + commit isolado (--no-verify, caminhos explícitos) e
evidência em evidence.md. Teste novo entra à mão na lista do package.json da app.
Na API, de dentro de apps/api-transportada, os dois comandos:
`bun --env-file=../../.env.test test --timeout 120000` e
`bun --env-file=../../.env.test run test:integration` (sem a flag a integração pula).
T1.2 põe o assert da migration antes; T1.3 fecha com `make migration-test` e db:generate = no_changes.
A Fase 0 sobe antes da Fase 2. O DELETE do motorista vai só com Authorization (CORS).
A T4.0 para se ProofImageLightbox ou removeQueuedAttachmentByKey não estiverem em origin/staging.
Pare e pergunte antes de: deploy em produção, migration destrutiva, duplicata achada na T1.1,
publicar a tela sem o "pode subir" do usuário na T4.4, e qualquer [NEEDS CLARIFICATION].
```
-->
