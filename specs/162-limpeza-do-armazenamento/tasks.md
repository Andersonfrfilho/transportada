# Tasks

| Fase | Tasks    | Modelo   | 🧠                      |
| ---- | -------- | -------- | ----------------------- |
| 1    | T1–T3    | `sonnet` | T2 (migration/índices)  |
| 2    | T4–T6    | `sonnet` | T5 (consulta de órfão)  |
| 3    | T7–T10   | `sonnet` | T9b (nota do motorista) |
| 4    | T11–T12  | `sonnet` | —                       |
| 5    | T13–T15b | `sonnet` | —                       |
| 6    | T16–T17  | `sonnet` | —                       |

Uma task por vez, na ordem. Teste de contrato **antes** da implementação em todas. Cada task fecha
com `bun run typecheck` + os testes da task + commit isolado + evidência em `evidence.md`.

✅ **Nenhuma dúvida em aberto.** As três `[NEEDS CLARIFICATION]` da primeira redação foram
respondidas e viraram decisão (spec.md § Dúvidas): `import_source` e `contractor_mail_raw` são
guarda e não se apagam; canhoto é protegido por vínculo, com saída individual por foto ilegível
(D8); e a nota do motorista não muda (D9, medido).

## Fase 0 — Medir antes de construir

> 🤖 Modelo: `sonnet` · **Portão: o resultado desta task decide se as Fases 1 a 6 acontecem.**

- [ ] **T0** Contar o que há para apagar — consulta **de leitura**, sem código de produção, contra a
      instalação real (staging e, se possível, produção): por finalidade, quantos objetos e quantos
      bytes; e, dentro de `delivery_proof`, quantos são **órfãos** (sem nenhuma das referências da
      tabela de D3) e que volume somam. Uma consulta única, `read only`, registrada em `evidence.md`
      com a data e o ambiente.
      **Aceite:** número absoluto de órfãos e bytes órfãos na mão, mais o total por finalidade
      apagável (`billing_document`, `aggregate_document`, `aggregate_application_attachment`,
      `trip_occurrence_thumbnail`).
      **Decisão, e ela é do usuário — parar e perguntar:** - **Ganho relevante** → seguir para a Fase 1. - **Ganho pequeno** → **não construir a tela.** Propor no lugar a varredura periódica que
      `docs/SECURITY.md:169` já pede: rotina de worker, sem interface, sem permissão nova — o que
      equivale a executar só as Fases 1 (parcial) e 4. O `plan.md` § "Alternativa barata" tem o
      recorte.
      ⚠️ Esta task não escreve código de produção e não abre commit de feature. Se ela for pulada, o
      resto da spec é construído sem saber se serve para algo.

## Fase 1 — A classificação e a permissão vêm antes de qualquer rota

> 🤖 Modelo: `sonnet` (T2 é 🧠 — validar com `architect` antes de gerar a migration)

- [ ] **T1** Classificação por finalidade **e por vínculo** — `shared/storage-purpose.constant.ts`
      (novo): `STORAGE_PURPOSE_CLASSIFICATION: Record<StorageObjectPurpose, 'protected' |
'purgeable' | 'by-link'>`, `STORAGE_LINK_CLASSIFICATION: Record<StorageObjectRecordType,
'protected' | 'purgeable'>` e a função pura `resolveStorageProtection({ purpose, recordType })`
      devolvendo `{ state, reason, individualPurgePath }`.
      Teste antes: `test/storage/purpose-classification.contract.ts` — percorre
      `STORAGE_OBJECT_PURPOSES` inteiro **e** os cinco casos de `delivery_proof`
      (`trip_delivery_proofs`, `trip_stop_occurrences`, `trip_document_occurrences`,
      `trip_document_occurrence_attachments` e órfão — só o último apagável); casos de
      tipo provam que finalidade nova **ou** tabela referenciadora nova não compilam sem entrada.
      ⚠️ Conferir `STORAGE_OBJECT_PURPOSES` em `origin/staging` antes: a spec 161 acrescentou
      `trip_occurrence_attachment` (`protected` — prova obrigatória) e `trip_occurrence_thumbnail`
      (`purgeable` — cache), já na tabela de D6, e a tabela `trip_document_occurrence_attachments`, com **duas** colunas para
      `stored_objects`.
      **Aceite (CA2b, CA3):** as finalidades classificadas conforme a tabela de D6 (11 na base de
      hoje, 13 com a 161 mesclada) — com `trip_occurrence_attachment` como `protected` (prova
      obrigatória) e `trip_occurrence_thumbnail` como `purgeable` (cache); e **todas** as tabelas
      referenciadoras de `delivery_proof` resolvendo para `protected`, sobrando apenas o órfão como
      apagável — as 5 fiscais
      mais `import_source` e `contractor_mail_raw` como `protected` (guarda: evidência e defesa
      contratual), `delivery_proof` como `by-link`; e o vínculo `trip_delivery_proofs` resolvendo
      para `protected` com `individualPurgePath: 'illegible'`. O teste de exaustividade falha se
      alguém acrescentar finalidade ou tabela sem classificar.

- [ ] **T2** 🧠 Migration aditiva de índices — `drizzle/<nova pasta>/migration.sql` + `snapshot.json` + rollback ao lado: índice `(company_id, created_at desc, id desc)`, índice parcial
      `(retention_until) where status='deleted'`, e os **16 índices de FK que faltam**, um por coluna
      da tabela de D3 (nenhum existe; o Postgres não indexa FK sozinho).
      Teste antes: `test/database-migration/schema-snapshot.contract.ts` verde, e
      `make migration-test` (migration + rollback em Postgres descartável).
      **Aceite:** `bun run db:generate` devolve `no_changes`; `make migration-test` verde; numeração
      conferida contra `origin/staging`; nenhuma coluna alterada.

- [ ] **T3** [P] Permissões — `identity/domain/authorization.policy.ts` (`storage.read`,
      `storage.purge` em `TRANSPORTADA_PERMISSIONS` e em `COMPANY_ROLE_PERMISSIONS['company-admin']`)
      e `frontend-transportada/src/modules/identity/shared/permissionGroups.constant.ts` (senão caem
      em `other` na tela de papéis).
      Teste antes: contrato de permissões + `test/separator-role.contract.test.ts` (rota nova reprova
      ali até decisão por escrito — a decisão é D1).
      **Aceite (CA1):** as duas permissões existem, só `company-admin` as recebe, e nenhum outro
      papel alcança as rotas.

## Fase 2 — Enxergar

> 🤖 Modelo: `sonnet` (T5 é 🧠 — a consulta de vínculo é o ponto de desempenho da spec)

- [ ] **T4** Listagem paginada — `storage/application/list-stored-objects.use-case.ts`,
      `storage/infrastructure/drizzle-stored-object.repository.ts` (`listPage`),
      `storage/presentation/storage.routes.ts` + `storage.schema.ts`, `shared/api.constant.ts`,
      `main.ts`. Cursor com `shared/keyset-cursor.support.ts`; filtros e teto de `limit` no molde de
      `parseAuditPage` (`operations.routes.ts:213-220`).
      Teste antes: `test/storage/list.contract.ts` — inclui o objeto protegido por vínculo
      aparecendo **marcado** (`protection.state = 'protected'`, `reason = 'delivery_proof'`), não
      omitido.
      **Aceite (CA2, CA4):** as 7 finalidades protegidas por inteiro nunca aparecem e `purpose` com
      valor protegido é `400`; o JSON
      serializado não contém `objectKey`, `bucket`, `provider` nem `sha256` (varredura no texto);
      `limit` acima de 100 é cortado, chave de query desconhecida é `400`.

- [ ] **T5** 🧠 Vínculo, proteção e órfão — `storage/infrastructure/stored-object-link.query.ts`
      (novo): os 16 `NOT EXISTS` da tabela de D3, o `recordType`, o filtro `link`, o `recordLabel`
      legível e sem PII, e a chamada a `resolveStorageProtection` **no mesmo passo** — a classe
      `by-link` não pode custar consulta extra nem quebrar o keyset (D6, camada 2).
      Teste antes: `test/integration/storage-object-link.integration.ts` — semeia um objeto em
      **cada uma** das 16 colunas e prova a classificação; mede a RNF4 com 100 mil linhas, inclusive
      com `link=orphan`.
      ⚠️ Conferir a contagem de colunas contra `origin/staging`: 16 hoje, **18 em 14 tabelas** com a
      spec 161 mesclada (`trip_document_occurrence_attachments.stored_object_id` e
      `.thumbnail_object_id`).
      **Aceite (CA9, CA2b, RNF4):** todas as colunas de referência cobertas uma a uma; `link=orphan` e `link=linked`
      exatos; `delivery_proof` classificado certo nos quatro casos;
      página em menos de 1 s com 100 mil linhas; nenhum `recordLabel` com nome, telefone, CPF ou
      e-mail. Rodar com `bun --env-file=../../.env.test run test:integration` — sem a flag, **pula**.

- [ ] **T6** [P] Resumo — `storage/application/summarize-storage.use-case.ts` + `summarize` no
      repositório + rota `GET /storage/summary`.
      Teste antes: caso em `test/storage/list.contract.ts`.
      **Aceite (RF1):** totais por finalidade purgável e por estado, só da empresa do contexto;
      finalidade fiscal ausente do resumo.

## Fase 3 — Apagar

> 🤖 Modelo: `sonnet`

- [ ] **T7** Política pura e erros — `storage/domain/storage-purge.policy.ts` e
      `storage-purge.error.ts`: dada finalidade, status, lease e janela, qual `outcome`
      (`purged` | `already_purged` | `refused_protected` com razão `purpose` ou `delivery_proof` |
      `refused_leased` | `not_found`).
      Teste antes: contrato de domínio, sem I/O, cobrindo a tabela inteira de D4.
      **Aceite:** função pura, sem banco nem gateway; todos os ramos cobertos.

- [ ] **T8** Exclusão em lote — `storage/application/purge-stored-objects.use-case.ts`,
      `purge-stored-objects.port.ts`, `markDeleted` no repositório,
      `stored-object-audit.persistence.ts` (molde de
      `trips/infrastructure/trip-field-office-audit.persistence.ts:21`), rota
      `POST /storage/purges` com `Idempotency-Key` e `rateLimit` declarado.
      Apagar no bucket **só** por `NfeStorageGateway.deleteObject` (RF7). `purged` vs
      `already_purged` decidido pelo `returning` do `UPDATE … where status <> 'deleted'`, nunca por
      leitura prévia.
      Teste antes: `test/storage/purge.contract.ts` + entrada em
      `test/rate-limited-routes.contract.test.ts`.
      **Aceite (CA5, CA6, CA7):** objeto vinculado vira `deleted` **e** a coluna referenciadora
      continua apontando para a mesma linha, com zero escrita em tabela de negócio; repetir a chave
      devolve a mesma resposta e não chama `deleteObject` de novo; uma linha de `audit_logs` por
      objeto, com ator, alvo, `metadata.ipAddress` (via `resolveClientIp`), permissão e instantâneos,
      e sem chave de objeto nem PII; finalidade protegida **e canhoto** recusados sem tocar o
      gateway; a reclassificação roda dentro da transação com `select … for update` (órfão que ganha
      vínculo entre listar e apagar é recusado).

- [ ] **T9** [P] Restauração — `restore-stored-object.use-case.ts`, `markRestored`,
      `POST /storage/objects/:id/restore`.
      Teste antes: `test/storage/restore.contract.ts`.
      **Aceite (CA8):** dentro da janela volta a `final` com `deleted_at`/`retention_until` nulos e
      trilha `storage.object.restored`; fora da janela é `409 STORAGE_OBJECT_ALREADY_PURGED`.

- [ ] **T9b** 🧠 O canhoto ilegível, e a prova de que a nota não muda —
      `storage/domain/illegible-reason.policy.ts` (20 a 500 caracteres, recusa de CPF, CNPJ,
      telefone, e-mail e CEP), `storage/application/purge-illegible-delivery-proof.use-case.ts`,
      rota `POST /storage/objects/:id/purge-illegible`, e trilha
      `storage.object.purged_illegible` com o motivo na coluna `reason` de `audit_logs` (o teto de
      500 é o CHECK que já existe — **sem migration**).
      Teste antes: `test/storage/purge-illegible.contract.ts` e
      `test/storage/driver-score-unchanged.contract.ts`.
      **Aceite (CA14, CA15):** é o **único** caminho que apaga canhoto — `POST /storage/purges`
      recusa, nenhum filtro o torna selecionável, a rotina do worker não o alcança sem ter passado
      por aqui; `reason` fora de 20..500 é `400`, `reason` com PII é `400`, o aceito vai para
      `audit_logs.reason`; e o contrato de regressão da nota calcula a nota do motorista, apaga o
      canhoto, recalcula e exige **valor idêntico**, provando junto que `trip_delivery_proofs` não
      foi escrita (nem a linha, nem `punctuality`, nem `object_id`).
      ⚠️ Este teste não confere a implementação atual — ele guarda a independência medida na D9
      contra alguém ligar a nota ao storage no futuro.

- [ ] **T10** Lápide não é erro de sistema — toda rota que serve objeto armazenado responde
      `410 STORED_OBJECT_PURGED` quando a linha está `deleted`.
      Teste antes: `test/storage/download-gone.contract.ts`.
      **Aceite (CA11, RF8):** nenhuma rota de download devolve `500` para objeto `deleted`; a rota de
      isolamento (`test/storage-schema/tenant-safety.contract.ts`, CA12) fecha junto — id de outra
      empresa é `not_found` na exclusão e invisível na lista.

## Fase 4 — Os bytes saem depois da janela

> 🤖 Modelo: `sonnet`

⚠️ Antes de começar: conferir o estado da spec 161 (expurgo por retenção de anexo de ocorrência).
Se ela já entregou rotina de expurgo, **absorver** em vez de criar uma segunda (RF7, risco 3 do
`plan.md`). Não editar `specs/161-*/`.

- [ ] **T11** Rotina `storage.object.purge` — quatro camadas em
      `apps/worker-transportada/src/storage-object-purge/`, cópia fiel do molde de
      `rate-limit-window-purge/` (constant com teto de lote e `MAX_BATCHES`, port funcional, routine
      com laço que para em teto/zero/`isStopRequested()`, repositório com `for update skip locked`).
      Seleciona `status='deleted' and retention_until <= now()` e **reclassifica** antes de chamar o
      provedor (finalidade protegida e vínculo de canhoto nunca perdem os bytes) — a quarta camada
      da barreira (D6). Apaga por `deleteObject`; ausente no provedor é sucesso.
      Teste antes: `test/storage-object-purge/purge.contract.ts` e `schema-parity.contract.ts`
      (o espelho `storedObjects` do worker precisa de `retention_until`).
      **Aceite (CA10, RNF5):** só a fatia certa é apagada; teto e parada respeitados; log
      `storage_object_purge_cycle_finished` com contagens e sem chave de objeto.

- [ ] **T12** [P] Catálogo de job nas duas apps — `shared/job-catalog.constant.ts` da API **e** do
      worker (`minimumIntervalSeconds: 3600`), registro no mapa `routines:` de
      `apps/worker-transportada/src/main.ts`, e `STORAGE_PURGE_GRACE_DAYS` (padrão 7) no schema de
      env validado.
      Teste antes: `test/job-catalog/catalog.contract.ts` (compara os dois catálogos, mesma ordem).
      **Aceite:** job registrado nos dois catálogos e no mapa de rotinas — job sem rotina pousa em
      `job_run_routine_missing` e fecha como `unexpected_error`.

## Fase 5 — A página

> 🤖 Modelo: `sonnet`

- [ ] **T13** Módulo e navegação — `modules/storage/` no molde de `modules/operations/`
      (page, hook, `storageClient.service.ts`, `storageResponse.validation.ts` — type guard manual,
      **sem zod no frontend** —, viewModel, locales, `*.module.css`); `main.tsx` (chave `'storage'`,
      item `{ href: '/armazenamento', key: 'storage', label: 'Armazenamento' }`, grupo
      `administration`, `lazy()`, `switch`, `resolveCurrentWorkspace()`, filtro do item por
      `storage.read`); três edições em `modules/shared/i18n/i18n.service.ts` (dois imports +
      namespace `storageWorkspace` em `en` e `pt-BR`).
      Teste antes: contrato do cliente e da navegação.
      **Aceite (D7):** `/armazenamento` abre e o título sai certo; o item some sem `storage.read`;
      textos pt-BR acentuados (`locale-accents.contract.ts`).

- [ ] **T14** Tabela, filtros e resumo — `StorageObjectTable.component.tsx` + hook, reusando
      `modules/shared/cursorPagination.service.ts`, `@/components/ui/filter-pills`,
      `@/components/ui/select` / `multi-select`, `@/components/ui/date-range-picker`,
      `@/components/ui/checkbox`, `@/components/ui/skeleton` na forma do conteúdo real. Primitivo
      cru é proibido fora de `src/components/ui/`.
      Teste antes: contrato do painel — falha da lista e lista vazia têm textos distintos (lição da
      RF5 da spec 157).
      ⚠️ Com o recorte das quatro decisões, o filtro de **finalidade** perdeu quase todo o valor
      (sobraram quatro finalidades apagáveis): os filtros que importam são **vínculo (órfão)**,
      tamanho e período. A ordem e o destaque na tela devem refletir isso. A miniatura não entra em
      filtro padrão nem em sugestão de limpeza (D6).
      **Aceite (RF10):** filtros de D2 funcionando, paginação com "anterior" e "próxima", estado de
      carregamento, aviso de falha com "Tentar de novo", texto próprio de lista vazia, e **objeto
      protegido aparecendo marcado** com razão legível em `tooltip` (nunca `title` nativo) e caixa de
      seleção desabilitada — nunca omitido da lista. O rótulo do filtro de órfãos avisa que ali há
      canhoto substituído.

- [ ] **T15** Confirmação em duas etapas — `PurgeConfirmDialog.component.tsx`: lote sem vínculo
      confirma numa etapa; lote com objeto vinculado **lista os registros que perdem o arquivo** e
      exige segunda confirmação digitada. Resultado por item resumido por `outcome`.
      Teste antes: contrato do diálogo + smoke com resposta mista (`purged` + `refused_protected`).
      **Aceite (CA16):** não há caminho de um clique só para apagar objeto vinculado; o diálogo diz
      quantos dias dura a janela e que depois dela não há desfazer.

- [ ] **T15b** Formulário de foto ilegível — ação individual na linha do canhoto protegido, com
      campo de texto obrigatório (20 a 500 caracteres, contador visível), validação de PII espelhando
      a do servidor, e o texto claro de que **a nota do motorista não muda** e o registro da entrega
      e do comprovante permanece (RF11, D9).
      Teste antes: contrato do formulário — não envia com menos de 20 caracteres nem com PII.
      **Aceite (RF11, CA16):** a ação não existe em lote, só na linha; o motivo é texto livre, nunca
      caixa de seleção; o aviso sobre a nota aparece **antes** de confirmar.

## Fase 6 — Fechamento

> 🤖 Modelo: `sonnet`

- [ ] **T16** Revisão de design e usabilidade (`web.md` §15) — comparar cada elemento tocado com os
      vizinhos da mesma tela (campo com campo, botão com botão), conferir contraste no estado normal
      e no selecionado, e conferir que o botão destrutivo não é o alvo fácil do dedo.
      **Aceite:** **print** da lista com filtros ativos e **print** do diálogo de confirmação com
      vínculo, em `specs/162-limpeza-do-armazenamento/prints/`, e a revisão escrita no
      `evidence.md`. Primitivo cru ao lado de um do design system é defeito desta task.

- [ ] **T17** Documentação viva e registro de segurança — atualizar
      `apps/api-transportada/CLAUDE.md` (módulo `storage` ganhou `presentation/`; as permissões
      novas), `apps/worker-transportada/CLAUDE.md` (rotina nova) e
      `apps/frontend-transportada/CLAUDE.md` (o primeiro item de menu filtrado por permissão);
      acrescentar em `docs/SECURITY.md` o achado dos 16 índices de FK ausentes e **atualizar sem
      fechar** a entrada de 2026-09-18 sobre objeto órfão no bucket — o expurgo por listagem do
      bucket (objeto sem linha em `stored_objects`) continua pendente e está fora do escopo desta
      spec.
      **Aceite:** `make check` verde de ponta a ponta; `evidence.md` com a saída dos dois comandos de
      teste da API (contrato e integração são listas e comandos distintos).

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/162-limpeza-do-armazenamento/ (leia spec.md, plan.md
e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md. Não toque em
specs/161-foto-na-ocorrencia-de-separacao/.

COMECE PELA T0 E PARE NELA. A T0 é portão: conta órfãos e bytes por finalidade na instalação real,
por consulta de leitura, sem código de produção. Traga o número e PERGUNTE ao usuário se segue. Se o
ganho for pequeno, a resposta certa é não construir a tela — proponha a § "Alternativa barata" do
plan.md (rotina de worker sem interface, ~4 tasks). Não avance para a Fase 1 sem essa resposta.

Modelos (depois do portão): Fase 1 → executor model=sonnet (T2 🧠 → opus, validar a migration com
architect antes de gerar) · Fase 2 → executor model=sonnet (T5 🧠 → opus: vínculo + proteção + órfão
com 18 NOT EXISTS num passo só é o coração da spec) · Fase 3 → executor model=sonnet (T9b 🧠 → opus:
canhoto ilegível e o contrato de regressão da nota do motorista) · Fases 4, 5 e 6 → executor
model=sonnet · revisão final → code-reviewer model=opus, com security-reviewer model=opus nas
Fases 2 e 3.

Teste de contrato antes da implementação em toda task. Cada task fecha com typecheck + os testes da
task + commit isolado, evidência em evidence.md. Na API são dois comandos e nenhum cobre o outro:
`bun --env-file=../../.env.test test --timeout 120000` (contrato) e
`bun --env-file=../../.env.test run test:integration` (integração, sem o --env-file ela PULA), e
arquivo de teste novo não roda sem ser listado no package.json da app.

Invariantes que não se negociam:
- A proteção é por FINALIDADE **e por VÍNCULO**, em quatro camadas (D6). Protegidas por inteiro: as
  5 fiscais, import_source, contractor_mail_raw e trip_occurrence_attachment (prova obrigatória da
  spec 161). Apagáveis: billing_document, aggregate_document, aggregate_application_attachment e
  trip_occurrence_thumbnail (cache, não prova).
- delivery_proof é `by-link`, e TODA tabela referenciadora resolve para `protected` — canhoto
  (trip_delivery_proofs) e foto de ocorrência, nova e antiga (trip_stop_occurrences,
  trip_document_occurrences, trip_document_occurrence_attachments). Só o ÓRFÃO é apagável. Mantenha
  a classificação por tabela mesmo assim: é ela que faz tabela nova virar erro de compilação.
- Canhoto só se apaga por POST /storage/objects/:id/purge-illegible, um por vez, com motivo escrito
  de 20 a 500 caracteres sem PII, que vai para audit_logs.reason. Nenhum lote, filtro ou outra rota
  o alcança. Foto de ocorrência NÃO tem exceção equivalente — não crie uma.
- Protegido ≠ eterno: a retenção da spec 161 (cinco anos) e seu expurgo automático continuam
  valendo. Esta spec impede o ato manual, não o prazo.
- A nota do motorista NÃO muda ao apagar canhoto, e o contrato da T9b prova isso calculando,
  apagando e recalculando. Não desvincule nada e não escreva em trip_delivery_proofs.
- Exclusão é lápide (status='deleted' + deleted_at), nunca DELETE de linha e nunca desvincular;
  apagar no bucket só por NfeStorageGateway.deleteObject; a reclassificação da camada 3 roda dentro
  da transação com select … for update.
- Objeto protegido por vínculo APARECE na lista, marcado e não selecionável — não o esconda.
- companyId sempre do contexto; nenhuma resposta, log ou trilha com objectKey/bucket/sha256 ou PII;
  trilha de auditoria por objeto com metadata.ipAddress.

Não há [NEEDS CLARIFICATION] em aberto. Pare e pergunte antes de: a decisão da T0, deploy e
migration destrutiva.
```
