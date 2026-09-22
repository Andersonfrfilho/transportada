# Tasks

| Fase | Tasks   | Modelo                                                       |
| ---- | ------- | ------------------------------------------------------------ |
| 1    | T1–T3   | `sonnet` (T1 é 🧠 — validar com `architect` em `opus` antes) |
| 2    | T4–T8   | `sonnet`                                                     |
| 3    | T9–T12  | `sonnet`                                                     |
| 4    | T13–T16 | `sonnet` (sem task 🧠 — ver nota da fase)                    |
| 5    | T17–T20 | `sonnet` (T17 é 🧠 — expurgo irreversível)                   |
| 6    | T21–T25 | `sonnet`                                                     |
| 7    | T26–T27 | `sonnet` (T27 fecha com `code-reviewer` em `opus`)           |

27 tasks. Uma por vez, na ordem. Teste de contrato **antes** da implementação. Cada task fecha com
typecheck + testes + commit isolado e evidência em `evidence.md`.

## Fase 1 — Modelo de dados, miniatura e retenção

> 🤖 Modelo: `sonnet` (T1 é 🧠 — tabela nova com duas FKs compostas para `stored_objects`, teto
> concorrente e CHECK de purpose recriado; validar com `architect` em `opus` antes da migration)

- [x] **T1** 🧠 Tabela `trip_document_occurrence_attachments` (com `thumbnail_object_id` nullable e
      índice parcial), unique `(company_id, id)` em `trip_document_occurrences` e os purposes
      `trip_occurrence_attachment` + `trip_occurrence_thumbnail` — `src/database/trip.schema.ts`,
      `storage.schema.ts`, `database.schema.ts`,
      `drizzle/20260921224341_trip_document_occurrence_attachments/` (`migration.sql`,
      `rollback.sql`, `snapshot.json`).
  - Critério de aceite (CA1): `db:generate` devolve `no_changes` depois de aplicada;
    `schema-snapshot.contract.ts` verde; rollback reverte com a tabela vazia e recusa (RAISE) com
    linha presente. `make migration-test` não rodou (Docker local fora do ar) — verificado por
    Postgres 18 nativo descartável na porta 65434; ver `evidence.md`.
  - Também: índice não-parcial de `(company_id, stored_object_id)` (a FK NOT NULL/RESTRICT); CHECK
    de purpose com `NOT VALID` + `VALIDATE CONSTRAINT`; ordem da migration com o unique de
    `trip_document_occurrences` primeiro. O mapeamento de `23505`/`23514` para
    `TripOccurrenceAttachmentLimitError`/409 (posição do INSERT monotônico) é de T6/T7, não desta
    task — comentário deixado em `trip.schema.ts` e em `plan.md`.

- [x] **T2** Política de anexo, miniatura e retenção — `occurrence-attachment.policy.ts`: teto 5,
      chaves de objeto sem PII para original e miniatura,
      `OCCURRENCE_PHOTO_MAX_BYTES = 512 KiB`, `OCCURRENCE_THUMBNAIL_MAX_BYTES = 128 KiB`,
      `OCCURRENCE_ATTACHMENT_RETENTION_YEARS = 5`, `resolveOccurrenceAttachmentRetentionUntil`,
      operações de idempotência.
  - Critério de aceite (RF3/D13): contrato prova `retention_until = created_at + 5 anos` para
    **original e miniatura**, os dois tetos, e que nenhuma chave contém nome, CNPJ ou número de
    nota.

- [x] **T3** Repositório e leitura unificada — `drizzle-occurrence-attachment.repository.ts`
      (inserir com miniatura opcional, contar, listar; sempre por `companyId`),
      `occurrence-attachment.service.ts` (RF15: tabela nova; sem linhas, cai na coluna
      `attachment_object_id`; RF26: `expired` pela data; `thumbnailUrl` ausente quando não há
      miniatura).
  - Critério de aceite (CA5/CA8): `attachment-read.contract.ts` antes do código, cobrindo sem anexo,
    só coluna antiga (sem miniatura), tabela nova com e sem miniatura, e retenção vencida;
    `tenant-safety.contract.ts` atualizado.

## Fase 2 — Contrato HTTP e obrigatoriedade

> 🤖 Modelo: `sonnet`

- [x] **T4** Erros novos — `trip.error.ts`: `OccurrencePhotoRequiredError` (422),
      `TripOccurrenceAttachmentLimitError` (409), `TripOccurrenceNotFoundError` (404).
  - Critério de aceite: contrato confere código, status e ausência de PII na mensagem.
  - O mapeamento de `23505`/`23514` (posição do INSERT monotônico) para
    `TripOccurrenceAttachmentLimitError` **não** entrou nesta task — comentário deixado na própria
    classe apontando para T6/T7, que é quem chama `insertOccurrenceAttachment`. Ver `evidence.md`.

- [x] **T5** Foto obrigatória **no caso de uso** (D1/RF4) — `register-trip-occurrence.use-case.ts`
      passa a receber `attachment?` e a recusar etapa `separation` sem anexo, antes de
      `saveOccurrence`, do storage e da auditoria.
  - Critério de aceite (CA2): contrato prova a recusa a partir do caso de uso, não da rota — o dublê
    de repositório **não** é chamado. Contratos que registravam ocorrência de galpão sem foto são
    atualizados.
  - ⚠️ As duas fiações reais em `src/main.ts` (rota JSON de registro e o passo de ocorrência do
    WhatsApp do operador) ainda não passam `attachment` — passam a responder sempre 422 até T6/T15
    ligarem a foto. Ver `evidence.md`.

- [x] **T6** Registro multipart com original e miniatura (RF5/RF7) — `occurrence.schema.ts` (parser
      com lista fechada, um `file` e no máximo um `thumbnail`; `thumbnail` sem `file` → 400),
      persistência dos **dois** objetos na mesma transação com `runWithStoredObjectCleanup`,
      `trip.routes.ts` (multipart, `Idempotency-Key`, rate limit 60/300 s), `main.ts`.
  - Critério de aceite (CA2/CA4/CA7b): `separation-upload.contract.ts` antes do código — JSON → 400;
    original > 512 KiB → 422; miniatura > 128 KiB → 422; tipo/assinatura errados → 422 com os dois
    objetos limpos; `file` sem `thumbnail` grava anexo sem miniatura; caso feliz grava ocorrência +
    `position: 1` + dois `stored_objects` `final` com retenção.

- [x] **T7** Rota de anexo adicional (RF6) — `attach-occurrence-photo.use-case.ts`,
      `occurrence.schema.ts`, `trip.routes.ts` (rate limit 300/300 s), `main.ts`.
  - Critério de aceite (CA3): `position: 2`; sexta → 409; outra empresa → 404; `delivery` → 422;
    aceita `file` + `thumbnail` como RF5. Ver `evidence.md`.

- [x] **T8** Idempotência e rate limit registrados — fingerprints em
      `occurrence-attachment.policy.ts` (sha256 do **original**, não da miniatura),
      `test/rate-limited-routes.contract.test.ts`.
  - Critério de aceite (CA18): mesma chave e mesmo conteúdo convergem; conteúdo diferente → 409
    `TRIP_FIELD_REPORT_KEY_REUSED`; as duas rotas listadas no contrato de rate limit. Ver
    `evidence.md` — a prova contra Postgres de verdade fica para T12/T16 (integração).

## Fase 3 — Leitura nas três telas

> 🤖 Modelo: `sonnet`

- [x] **T9** Painel da nota devolve `attachments[]` com miniatura (RF8/RF9) —
      `delivery-proof-read.support.ts:175-271`, `main.ts:2717-2745` (sai o `attachment` singular).
  - Critério de aceite (CA5): ordem por `position`; `downloadUrl` e `thumbnailUrl` assinados;
    **ausência** de `objectKey`/`bucket`; `[]` para ocorrência antiga; anexo sem miniatura sem
    `thumbnailUrl`; anexo vencido sem nenhuma URL.

- [x] **T10** Feed / consulta de ocorrências (RF10) — `trip-occurrence-feed.query.ts` (sai o
      `hasAttachment: false` fixo da linha 234; `listTripOccurrenceAttachmentLocations` passa a unir
      a tabela nova e a devolver miniatura).
  - Critério de aceite (CA6): ocorrência de nota com e sem foto; `/trip-occurrences/:id/attachments`
    lista as cinco no formato de RF8, com e sem `thumbnailUrl`.

- [x] **T11** Linha do tempo com contagem (RF12) — fonte de ocorrência de nota do
      `GET /trips/:id/timeline`.
  - Critério de aceite (CA7): `attachmentCount` correto, **nenhuma** URL assinada (nem de original,
    nem de miniatura), cursor inalterado.

- [x] **T12** Integração da leitura contra Postgres —
      `test/integration/trip-occurrence-attachment.integration.ts` criado e **somado ao script
      `test:integration`**; rodar com `bun --env-file=../../.env.test run test:integration`.
  - Critério de aceite: as três leituras (painel, feed, linha do tempo) sobre as mesmas linhas, com
    isolamento por empresa exercitado.

## Fase 4 — WhatsApp pede a foto

> 🤖 Modelo: `sonnet` — **nenhuma task 🧠 nesta fase**. A T13 era 🧠 porque injetava
> `providers.objectStorage`; a validação de arquitetura reprovou esse desenho (D7), e o que sobrou é
> reuso de um bloco que já existe, sem decisão estrutural pendente.

- [ ] **T13** A ocorrência do WhatsApp usa a mesma persistência da rota HTTP (RF16) — na dep
      `registerOccurrence` de `src/main.ts:826-843`, trocar o `saveOccurrence` cru por
      `persistSeparationOccurrenceWithAttachment` (já importado em `src/main.ts:233` e usado pela
      rota em `src/main.ts:2799-2824`), com `attachment` opcional.
  - Critério de aceite (CA9b/CA9c): a ocorrência vinda do WhatsApp nasce com `stored_objects` de
    purpose `trip_occurrence_attachment`, `retention_until` de cinco anos, chave
    `tenants/…/trip-occurrence-attachments/…` e **sem** miniatura; e um contrato de regressão prova
    que `meta-whatsapp-module.resolver.ts:82-95` continua **sem** `providers` — falha se alguém
    injetar `objectStorage`.

- [ ] **T14** A imagem viaja por contexto, não pela assinatura (RF17/D16) —
      `whatsapp-answer.policy.ts:7-13` **mantém** `string | undefined`; o despachante escreve o
      descritor da imagem numa chave de contexto ao montar o cursor
      (`whatsapp-command-driver.service.ts:222-229`), e o router lê e **apaga no mesmo turno**.
  - Critério de aceite (CA9): assinatura inalterada — de outro jeito não compila, porque o
    `FlowInterpreter` tipa `userAnswer?: string` e o handler não recebe a mensagem; botão, lista e
    texto inalterados; **imagem em nó de escolha vira resposta inválida e conta para o handoff**;
    `media-id` nunca em log e ausente do contexto ao fim do turno (é handle resgatável com o token
    da empresa, vale como credencial de curta duração).

- [ ] **T15** Passo de foto no fluxo do operador (RF18/RF18b/RF18c/RF19/RF20) —
      `whatsapp-operator-flow.constant.ts` (nó `operator_occurrence_photo_entry`, `actionKind`,
      chaves de contexto, rótulos "✅ Concluir" e "❌ Cancelar ocorrência", e o texto que avisa que
      sem foto nada é registrado), `register-operator-trip-flow-actions.ts` (`noteRouter` l.580-620
      passa a `photoPrompt`; `photoRouter` lê o contexto, baixa por `channel.fetchMediaAsBase64`,
      valida e grava), teto de bytes como **parâmetro** de
      `persistSeparationOccurrenceWithAttachment` (o WhatsApp passa `OFFICE_PROOF_MAX_BYTES`
      **importado** de `delivery-proof.policy.ts`, sem constante nova — §16 do code-standart), e
      `describeTripError` com `TRIP_DELIVERY_PROOF_TOO_LARGE` e `_UNSUPPORTED_TYPE`.
  - Critério de aceite (CA10/CA11/CA11d): imagem anexa e repete o pedido; **foto entre 512 KiB e
    960 KiB é aceita** (prova que o teto virou parâmetro — sem isso ela passaria no router e seria
    recusada dentro do serviço); acima de 960 KiB e tipo errado são recusados com mensagem que diz o
    limite e a saída; **texto incrementa o contador de tentativas inválidas e o handoff acontece** —
    o teste falha se o fluxo repetir o pedido indefinidamente; cancelar não grava nada; sexta imagem
    recusada; falha de download não grava ocorrência.

- [ ] **T16** Idempotência e integração ponta a ponta (RF20b) — chave por **sha256 do arquivo
      baixado**, nunca `media-id` (muda no reenvio) nem `occurrenceId` (circular: ainda não existe
      no momento do upload); `test/integration/whatsapp-operator-flow-actions.integration.ts` (já
      listado).
  - Critério de aceite (CA11b/CA11c/CA12): reenviar a mesma foto com `media-id` diferente não
    duplica anexo; **a reentrega do mesmo webhook é barrada pelo `nonceStore`, provado por teste, não
    assumido**; nenhum `stored_objects` com origem WhatsApp nasce com purpose diferente de
    `trip_occurrence_attachment`; nenhum log com `mediaId`, telefone ou chave.

## Fase 5 — Retenção de cinco anos

> 🤖 Modelo: `sonnet` (T17 é 🧠 — expurgo apaga arquivo de forma irreversível; validar com
> `architect` em `opus` antes de escrever a rotina)

- [ ] **T17** 🧠 Rotina `trip.occurrence-attachment.purge` no worker (RF21–RF25) —
      `apps/worker-transportada/src/trip-occurrence-attachment-purge/`, registro em
      `apps/worker-transportada/src/main.ts`, no molde de `rate-limit-window-purge/`.
  - Critério de aceite (CA13): apaga original **e** miniatura no mesmo lote, marca
    `status: 'deleted'`/`deleted_at`, remove a linha do anexo, **não** toca a ocorrência, respeita
    lote/`MAX_BATCHES`/`isStopRequested`, converge com objeto ausente, e loga só contadores.

- [ ] **T18** Catálogo e agendamento (RF21) — `job-catalog.constant.ts` das **quatro** apps
      (`minimumIntervalSeconds: 86_400`) e migration
      `drizzle/<ts>_trip_occurrence_attachment_purge_job/` (CHECKs ampliados, `INSERT INTO
job_schedules`, índice parcial `stored_objects_purpose_retention_idx`).
  - Critério de aceite (CA14): `test/job-catalog/catalog.contract.ts` verde; `make migration-test`
    verde com rollback.

- [ ] **T19** Integração do expurgo — `test/trip-occurrence-attachment-purge.integration.test.ts` no
      worker, **somado ao `package.json`** (`test` e `test:integration`).
  - Critério de aceite (CA15): via `make worker-integration`, foto vencida some do bucket (original e
    miniatura) e da tabela, e a ocorrência segue legível; foto dentro do prazo intocada.

- [ ] **T20** Registro em `docs/SECURITY.md` (RF27) — entrada no formato do arquivo
      (`### AAAA-MM-DD — …`, com `Onde`, `O que é`, `Corrigido`/`O que continua aberto`, `Origem`),
      cobrindo: retenção de cinco anos; a varredura nova (fechando parcialmente o achado aberto de
      `docs/SECURITY.md:149-172`); e os dois riscos assumidos — mídia do WhatsApp **com EXIF/GPS e
      sem miniatura**, com a justificativa de não acrescentar biblioteca de imagem no servidor e o
      custo do caminho de saída (`sharp`: binário nativo, compatibilidade com Bun, CVE de
      decodificador, CPU no request); e a ingestão de mídia alargada pela T13.
  - Critério de aceite (CA19): entrada presente, datada, com dono; nenhum achado antigo apagado.

## Fase 6 — Diálogo do conferente e as telas

> 🤖 Modelo: `sonnet`

- [ ] **T21** Reencode e miniatura no navegador (RF29/RF29b) —
      `occurrencePhotoImage.service.ts` sobre `loadImageFromFile`/`drawFullResolutionCanvas` já
      existentes: original ≤ 1600 px / ≤ 400 KB e miniatura ≤ 320 px / qualidade 0,7 do **mesmo**
      canvas.
  - Critério de aceite (CA7b): contrato antes do código — dimensões e alvos respeitados; EXIF
    ausente no resultado; falha de geração da miniatura devolve só o original, sem lançar.

- [ ] **T22** Cliente e envio sequencial (RF31) — `tripClient.service.ts` (multipart com `file` +
      `thumbnail`, `attachOccurrencePhoto`), `occurrencePhotoSend.service.ts` (estado por foto,
      reenvio só do que falhou), `useTripWorkspace.hook.ts` (chave estável por foto, invalidação de
      `occurrences` e `['trip','occurrence-feed']`).
  - Critério de aceite (CA16): uma foto por requisição levando os dois objetos; chave repetida no
    reenvio; falha da terceira de cinco preserva as duas anteriores.

- [ ] **T23** Seletor de foto com câmera e arquivo (RF28/RF30/D3/D4) —
      `OccurrencePhotoPicker.component.tsx` (novo, sobre `useCameraStream`, miniaturas locais,
      remover, teto de cinco), `TripOccurrences.component.tsx` (envio bloqueado sem foto, com motivo
      visível), `SeparationOccurrenceDialog.component.tsx`.
  - Critério de aceite (CA17): `denied`/`unavailable` mostram aviso e mantêm o seletor de arquivo;
    sem foto o envio fica desabilitado; sexta foto não é oferecida. Primitivos do design system
    obrigatórios.

- [ ] **T24** As três telas mostram miniatura (RF9/RF10/RF11/RF13/RF14/RF32/RF32b) —
      `trip.types.ts`, `tripResponse.validation.ts`, grade de miniaturas com overlay do original no
      painel da nota, no detalhe da ocorrência e no feed `/ocorrencias`
      (`TripOccurrenceTable.component.tsx`), esqueleto + `loading="lazy"`, selo de foto expirada,
      queda para o original quando não há miniatura, `TripTimeline.component.tsx` com marcador e
      contagem.
  - Critério de aceite (CA6b/CA17): `occurrence-thumbnail.contract.ts` e
    `occurrence-expired-attachment.contract.ts` — a lista pede miniatura e só busca o original ao
    abrir; anexo sem miniatura cai para o original; a grade não bloqueia a renderização; falha de
    uma imagem não derruba as outras; anexo `expired` vira selo e **nunca** `<img>`; `attachments`
    ausente → `[]` sem quebrar a tela.

- [ ] **T25** Textos (RF33) — `trip.locale.json` e `trip.en.locale.json`: textos do picker, do aviso
      de câmera, do erro sem foto, do selo de expiração e do estado de imagem que não carregou;
      **sai** `occurrence.occurrencePhotoHint` (`trip.locale.json:1048`). Textos do passo do
      WhatsApp na constante do fluxo.
  - Critério de aceite: `locale-accents.contract.ts` verde; nenhuma referência órfã ao texto removido
    (`grep`).

## Fase 7 — Prova e revisão

> 🤖 Modelo: `sonnet` (a revisão final vai para `code-reviewer` em `opus`)

- [ ] **T26** Smoke e prints — `test/spec-161-prints.smoke.spec.ts` (molde de
      `spec-159-prints.smoke.spec.ts`, PNG 1×1 sintético, **nenhuma foto real em fixture**), rodado
      com `PLAYWRIGHT_TEST_MATCH`.
  - Critério de aceite (CA20): PNGs em `specs/161-foto-na-ocorrencia-de-separacao/prints/` — diálogo
    com miniaturas, diálogo em modo "só arquivo" (câmera negada), painel da nota com três fotos,
    feed `/ocorrencias` com a grade de miniaturas, e painel com foto expirada — em 390×844 e
    1440×900, tema claro e escuro.

- [ ] **T27** Revisão de design e usabilidade (`web.md` §15) — comparar o picker e a grade com os
      vizinhos da mesma tela (campo com campo, botão com botão), conferir contraste no estado normal
      e no selecionado, e revisar o caminho completo no telefone: abrir, fotografar, remover, enviar,
      falhar, reenviar, abrir a foto em tela cheia, ver foto expirada.
  - Critério de aceite: print de cada estado no `evidence.md` com a leitura escrita da revisão;
    `make check` verde; `bun --env-file=../../.env.test run test:integration` verde;
    `make worker-integration` verde; revisão final por `code-reviewer` em `opus` (passe separado,
    sem autoaprovação).

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/161-foto-na-ocorrencia-de-separacao/ (leia spec.md,
plan.md e tasks.md antes de começar). 27 tasks em 7 fases, uma por vez, na ordem do tasks.md, teste
de contrato antes da implementação.
Modelos: Fase 1 → executor model=sonnet, T1 🧠 validada por architect model=opus antes da migration ·
Fase 2 → executor model=sonnet · Fase 3 → executor model=sonnet · Fase 4 → executor model=sonnet,
sem task 🧠 (a validação de arquitetura já reprovou a injeção de providers.objectStorage: NÃO injete;
reuse persistSeparationOccurrenceWithAttachment e mantenha o resolver sem providers) ·
Fase 5 → executor model=sonnet, T17 🧠 validada por architect model=opus (o expurgo apaga
arquivo de forma irreversível) · Fase 6 → executor model=sonnet · Fase 7 → executor model=sonnet e
revisão final por code-reviewer model=opus.
Cada task fecha com typecheck + testes + commit isolado, evidência em evidence.md. Testes da API são
dois comandos: `bun --env-file=../../.env.test test --timeout 120000` (contrato) e
`bun --env-file=../../.env.test run test:integration` (integração) — sem a flag a integração pula.
O expurgo também exige `make worker-integration`, e as migrations exigem `make migration-test`.
A miniatura é cache, nunca prova: nenhuma falha de miniatura pode impedir o envio ou a leitura do
original (RF29b, RF32b). T1–T8 já estão implementadas e commitadas — comece pela T9.
Pare e pergunte antes de: deploy, migration destrutiva, e antes de rodar o expurgo em produção (ele
apaga arquivo e não tem volta — um ciclo de observação em staging primeiro).
```

A spec não tem `[NEEDS CLARIFICATION]` aberto.
