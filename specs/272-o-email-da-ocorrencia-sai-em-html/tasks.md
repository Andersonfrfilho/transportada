# Tasks — 272 O e-mail da ocorrência sai em HTML

> **Revisão 2 (mudança de escopo do dono, 2026-10-18):** o HTML vem do modelo do módulo de notificação. Tasks
> renumeradas para menos passos e menos gates repetidos; os IDs fechados (T0.1, T0.2, T1.1–T1.3) ficam. As tasks
> abertas da revisão 1 estão em § Substituídas na revisão 2.
>
> Cada task responde: **Mecânica?** (tudo descrito) · **Aceite por comando?** (tsc/teste/`make check`).
> Duas respostas "sim" → `haiku`. Gate de toda task de código: `bun run typecheck` (`tsc --noEmit`) + lint por app (cwd
> na app) + testes da app (script `test` do `package.json`, nunca `bun test` cru) + commit isolado
> (`git commit --only`). Escalada: gate falhou 2× → sobe um nível e registra em `evidence.md`.
> Teste novo entra no agregador e na lista explícita do `package.json` da app.
> Task que toca `test/integration/**` só fecha com `bun --env-file=../../.env.test run test:integration` (de
> `apps/api-transportada`) **sem nenhum skip**.
> Task com migration: aplica, reverte e reaplica (`make migration-test` ou Postgres descartável) e `db:generate` com
> `no_changes` depois.
> Worktree: `~/personal/transportada-wt/spec-272` (branch `work/spec-272`). Nada é feito fora dela.
> Antes de começar o código: rebase em `origin/staging`.

## Fase 0 — Contrato antes do código

> 🤖 Modelo: `sonnet` (T0.2 e T0.3 são 🧠)

- [x] **T0.1** `sonnet` — Conferir contra `origin/staging` o § Levantamento e o `plan.md` § Contexto (revisão 1).
      (Concluída; `evidence.md` § T0.1.)
- [x] **T0.2** 🧠 `opus` — ADR-0110 revisão 1 validada com `architect` (aceita em 2026-10-18; `evidence.md` § T0.2).
      **Substituída em parte** pela mudança de escopo: o que sobrou dela está marcado "Mantida" na ADR revisão 2.
- [ ] **T0.3** 🧠 `opus` — Validar a ADR-0110 **revisão 2** com `architect` (opus): renderer de uma passada com o
      conjunto fechado de chaves HTML do sistema (D3), regras de HTML inseguro e as três cópias (API, painel, worker —
      D2), parte texto (D4), envio manual com modelo HTML (D12), migration mínima e a saída de `signer_*`/`layout_version`
      (D9) contra a 273, script por chave (D14). Ajustes aprovados entram no `plan.md` e na ADR (marcados "Ajustado na
      T0.3"); status → "aceita". **Outras tasks herdam este contrato.** Aceite: `evidence.md` § T0.3 com o veredito;
      `grep -n "Status:\*\* aceita" docs/adr/0110-o-email-da-ocorrencia-sai-em-html.md` casa.

## Fase 1 — Painel tolerante

> 🤖 Modelo: `haiku`

- [x] **T1.1** `haiku` — Teste que prova a tolerância da prévia e do histórico às chaves novas (sem mudar código).
- [x] **T1.2** `haiku` — Teste que prova a tolerância do usuário da empresa ao `jobTitle` (sem mudar código).
- [x] **T1.3** `sonnet` — T1.1 e T1.2 passaram sem mudar código de produção: **não há deploy da Fase 1** (registro em
      `evidence.md` § T1.3). Na revisão 2 a guarda dos modelos também já tolera o código novo `unsafe_html`
      (`toProblem` descarta código desconhecido): nada a publicar antes da API.

## Fase 2 — API

> 🤖 Modelo: `sonnet` (T2.1 → `haiku`)

- [ ] **T2.1** `haiku` — Dados: migration aditiva `contractor_mail_message_inline_logo` (`has_inline_logo boolean not
null default false`) e migration aditiva `user_company_membership_job_title` (`job_title varchar(80)` nula + CHECK
      `1..80`), schemas Drizzle (API; espelho de `has_inline_logo` e `direction` no worker), `rollback.sql` de cada uma;
      teste antes e política pura `company-user-job-title.policy.ts` (tabela de casos: quebra de linha, controle, bidi
      U+202A–U+202E e U+2066–U+2069, espaços, 80 e 81, vazio → `null`). Aceite: `make migration-test` (aplica, reverte,
      reaplica) verde; `bun run db:generate` → `no_changes`; testes da política verdes.
- [ ] **T2.2** `sonnet` — Renderer (D2, D3, D4), teste antes: `occurrence-mail-html-safety.policy.ts` (tabela de casos
      das cinco regras; também vira o arquivo-fonte da tabela copiada pelo painel e pelo worker),
      `occurrence-mail-html-render.policy.ts` (uma passada; `OCCURRENCE_MAIL_SYSTEM_HTML_VARIABLES` `as const`; `values`
      e `systemHtml` em objetos separados), `occurrence-mail-plain-text.policy.ts`; `assessContractorTemplate`: `html_body`
      sai, `unsafe_html` entra em `SEND_BLOCKING_CODES` (ajustar `template-policy.contract.ts`, `type-template-key`,
      `template-routes` e a integração `occurrence-type-contractor-template`). Aceite: casos do `plan.md` § Testes D2–D4
      (escape de `<b>x</b> & "y"`, chave raw só pelo nome, `{{logoTransportadora}}` dentro de valor não reinterpretado,
      modelo seguro utilizável, inseguro 400/409) e `bun --env-file=../../.env.test run test:integration` sem skip.
- [ ] **T2.3** `sonnet` — Variáveis e leituras (D5, D6, D11), teste antes: `findOccurrenceTarget` com
      `contractorTaxId`; `findCarrierIdentity` (nome de exibição, CNPJ, `hasLogo`); `findOperatorSigner` (nome + cargo +
      papéis diretos, uma consulta); porta `OccurrenceOwnerReader` nula; `resolveSignerJobTitle`; `COMPANY_ROLE_LABELS` + contrato de paridade com `identity.locale.json`; `occurrence-mail-system-html.policy.ts` (logo/iniciais,
      tabela de itens, marcas); `APP_BASE_URL` opcional no schema de env; as oito variáveis novas no catálogo da API
      **e** em `OCCURRENCE_MAIL_VARIABLE_NAMES`/`OCCURRENCE_MAIL_SAMPLE_VALUES` e nos dois locales do painel (o contrato
      `occurrence-type-mail-parity.contract.ts` exige os dois lados no mesmo commit). Aceite: casos D5/D6/D11 do
      `plan.md` (200 itens < 100 KB, 201 → "e mais 1 item", sem logo → iniciais, CPF/CNPJ/sem documento, cargo/papel/
      nenhum, dono injetado); integração das leituras (outra empresa não aparece); paridade verde nas duas apps.
- [ ] **T2.4** `sonnet` — Envio (D7, D8, D12), teste antes: `occurrence-mail-subject.policy.ts` (prefixo, corte em 80,
      idempotente) e `occurrence-mail-sender-name.policy.ts` (tabela de casos do "De", que o worker copia);
      `send-occurrence-mail` e `send-automatic-occurrence-mail` escolhem o caminho HTML ou texto, montam os valores, o
      assinante (`operator`/`owner`/`team`), gravam `body_html`, `body_text` gerado, `from_display_name` (nunca o
      `sender_name`) e `has_inline_logo`; a prévia devolve `bodyText` gerado e `html` do modelo; D12 (texto mantido →
      HTML, editado → texto). Aceite: critérios 1, 4, 6, 7 (pelo valor gravado), 9, 11 e 12 da spec por contrato;
      integração manual e automático com modelo HTML e com modelo texto, Resend e sandbox, sem skip.
- [ ] **T2.5** `sonnet` — Cargo, rota (D10), contratos antes (critério 13: ausente não altera, `null`/`""` limpa, 81 →
      400, quebra saneada, 403, 404 outra empresa, só `jobTitle` não chama o gateway do Keycloak); depois o schema
      `.strict()`, o caso de uso (`updateJobTitle` por `(user_id, company_id)`) e a resposta por `toCompanyUserView`.
      Aceite: contratos verdes; integração grava, lê de volta e não toca outra empresa, sem skip.

## Fase 3 — Worker

> 🤖 Modelo: `sonnet`

- [ ] **T3.1** `sonnet` — Teste antes. "De" por `from_display_name` em `outbound` nos dois transportes (Resend
      `"Nome" <endereço>`, sandbox `{ name, address }`), com o saneamento copiado da tabela da T2.4; confirmar na doc
      oficial do Resend (context7) se nome não ASCII é codificado (RFC 2047) e registrar. Logo inline quando
      `has_inline_logo` (`drizzle-company-logo.reader.ts`, `content_id` no Resend, `cid` no nodemailer; logo ausente →
      sem a parte, log só com `messageId` e motivo). Fila do automático: `UNSAFE_EMAIL_HTML_PATTERN` no lugar de
      `HTML_BODY_PATTERN`, contrato espelhado com a tabela da T2.2. Aceite: critérios 5 (parte inline), 7 e 8 contra os
      dublês; integração da fila (HTML seguro entra, inseguro não) sem skip; `bun run test` do worker verde.

## Fase 4 — Telas, modelos e documentação

> 🤖 Modelo: `sonnet` (T4.2 e T4.4 → `haiku`)

- [ ] **T4.1** `sonnet` — Teste antes. Campo "Cargo" em `CompanyUserEditDialog.component.tsx` (texto, até 80,
      contador, ajuda "Aparece na assinatura dos e-mails de ocorrência", vazio limpa) no `PATCH` existente e o cargo
      abaixo do nome em `UserAdministration.page.tsx`; código `unsafe_html` em `PROBLEM_CODES` e no locale (no lugar de
      `html_body`); prévia do editor do tipo com corpo HTML num `<iframe sandbox="" srcDoc>` com os exemplos;
      `emailHtml.validation.ts` com as quatro regras novas como `error` e a tabela de paridade da T2.2. Locales pt-BR/en.
      Aceite: `bun run test` do painel verde (contratos + `test:hooks`); revisão de design contra a página (`web.md`
      §15), um print ao fim.
- [ ] **T4.2** `haiku` — Os cinco modelos `.html` a partir de `desenho-aprovado.html` (`render()` e `TEMPLATES`):
      `apps/api-transportada/src/occurrence-conversation/occurrence-mail-templates/{prorrogacao-boleto,avaria,devolucao,entrega-nao-realizada,recusa}.html`,
      com `<!-- subject: … -->` no topo; cabeçalho com `{{logoTransportadora}}` **antes** de `{{nomeExibicao}}`, resumo
      Nota fiscal / Partes / Registro com `{{valorNota}}` em linha própria e `{{cnpjContratante}}` em linha própria,
      corpo do `TEMPLATES`, `{{tabelaItens}}` nos três com itens, assinatura `{{assinaturaNome}}`/`{{assinaturaCargo}}`,
      rodapé com `{{marcasRodape}}`; tabelas e estilos inline, cores fixas, 620 px. Depende das respostas Q2/Q3 do
      dono (`evidence.md` § Perguntas ao dono): sem resposta, **parar e perguntar**. Aceite: teste de forma e de
      validação sobre os cinco arquivos (passam na D2, só variáveis da lista, sem `display:grid|flex`, `var(`,
      `<script`, `@import`), no script `test` da API.
- [ ] **T4.3** `sonnet` — Teste antes. `apps/api-transportada/scripts/occurrence-mail-templates-publish.ts --company
<uuid> [--confirm]` (D14, molde de `whatsapp-flow-publish.ts`): valida os cinco arquivos (recusa todos se um
      falhar), compara com a versão ativa mais alta de cada chave (`email`, `pt-BR`) e grava versão nova só quando
      mudou; sem `--confirm` só imprime o plano; nunca `UPDATE` de versão existente; sem PII no que imprime. Aceite:
      contrato/integração com Postgres descartável (dry-run não grava, `--confirm` grava a versão 1, segunda rodada não
      grava, arquivo inválido não grava nenhuma chave), sem skip. **Rodar contra staging ou produção não faz parte
      desta task: PARE E PERGUNTE** (é mudança de dados; vai na T5.2).
- [ ] **T4.4** `haiku` — Documentação viva. Aceite por `grep` de cada item nos arquivos:
  - `CLAUDE.md` da **raiz**: seção curta "E-mail em HTML vem do modelo do módulo de notificação (spec 272, ADR-0110)":
    o visual mora no modelo HTML de Notificações; **proibido layout de e-mail em código**; modelo novo = `.html`
    versionado + script idempotente por chave (rodar em staging/produção pede aprovação); o renderer da API escapa só
    os valores, valida o HTML e gera o `text/plain`; variáveis já HTML (`logoTransportadora`, `tabelaItens`,
    `marcasRodape`) são montadas pelo sistema; onde ficam os `.html` e o script; aponta a regra global
    `~/.claude/rules/rules/email-templates.md`.
  - `apps/api-transportada/CLAUDE.md` e `docs/ai-context/api-transportada.md`: o mesmo, com a lista completa de
    variáveis (texto e HTML do sistema), o caminho do renderer (`occurrence-mail-html-render.policy.ts`, safety,
    plain-text, system-html), o `unsafe_html` no lugar do `html_body`, o "De" e o prefixo, o cargo.
  - `apps/worker-transportada/CLAUDE.md`: uma linha sobre o logo por `cid:` (`has_inline_logo`, `company_logos`) e o
    "De" por `from_display_name`; `docs/ai-context/worker-transportada.md` com o detalhe e o filtro novo da fila.
  - OpenAPI do `PATCH /company-users/:id` com `jobTitle`; `.env.example` e `.railway/railway.ts` (`APP_BASE_URL` na API
    como `preserve()`).
  - `bunx prettier --check` nos arquivos tocados.

## Fase 5 — Fechamento e publicação

> 🤖 Modelo: `sonnet`

- [ ] **T5.1** `sonnet` — Gates completos e revisão: `bun run typecheck`; lint por app; script `test` da API, do
      worker e do painel; contrato da API `bun --env-file=../../.env.test test --timeout 120000`; integração
      `bun --env-file=../../.env.test run test:integration` sem skip; `bunx prettier --check .` na raiz; auditoria §15
      (PII em log, `Promise.all` × `allSettled` nas leituras novas, tamanho do HTML). Depois `code-reviewer` e
      `security-reviewer` em paralelo sobre `origin/staging...HEAD` (escape por valor, chave raw só pelo nome, as três
      cópias da regra de HTML inseguro, injeção de cabeçalho no "De", BOLA no logo e no `jobTitle`, cargo fora de log,
      `iframe` sem script, script de modelos sem `UPDATE`). Corrigir e reverificar. Por fim, no Mailpit local (268), com
      os modelos gravados pelo script **no banco local**: um manual e um automático, lidos por texto pela API do
      Mailpit (`/api/v1/message/<id>`, `/headers`): "De" com nome, prefixo, parte inline, tabela, assinatura com cargo;
      um screenshot só no fim, como prova.
- [ ] **T5.2** `sonnet` — Publicação **com aprovação humana em cada passo** (plan § Publicação): rebase em
      `origin/staging`, `bun install --frozen-lockfile`, gates, numeração de spec/ADR/migration contra `origin/staging`
      e contra a 273 (mesmo pai de `snapshot.json`: quem chega depois regenera); API + worker juntos → `staging` (os dois
      jobs verdes); telas → `staging`; **PARE E PERGUNTE** antes de rodar o script dos modelos em staging (mostrar o
      dry-run); conferir no Mailpit de staging; um envio real pelo Resend (nome não ASCII no "De", logo inline) antes de
      `main`; `main` só depois de 269 + 270 + 271; o script em produção é outra aprovação.

## Substituídas na revisão 2

Tasks abertas da revisão 1 (nenhuma tinha começado). Mantidas para rastreio; motivo em `evidence.md` § Mudança de
escopo.

| Revisão 1 | Situação                                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| T2.1      | **Substituída** pela T2.1 nova (só `has_inline_logo`; `signer_*`, `layout_version` e os três CHECKs saem)                           |
| T2.2      | **Substituída** (montador e golden files de layout) pela T2.2 nova (renderer) e pelos modelos da T4.2                               |
| T2.3      | **Mantida** dentro da T2.4 nova (prefixo e "De")                                                                                    |
| T2.4      | **Mantida** como T2.3 nova (leituras, porta, rótulos), mais as variáveis                                                            |
| T2.5      | **Substituída** pela T2.4 nova (envio pelo modelo; sem `itemLinesBlock`)                                                            |
| T2.6      | **Adiada pelo dono em 2026-10-18 — spec seguinte** (reenvio da 248 com layout/assinante do original); o reenvio continua como hoje  |
| T2.7      | **Adiada pelo dono em 2026-10-18 — spec seguinte** (`fullSubject`, `inlineLogo`, balde da prévia); sobra o `html`/`bodyText` (T2.4) |
| T2.8      | **Mantida** dentro da T4.4                                                                                                          |
| T2.9      | **Mantida** dentro da T2.1 (migration e política do cargo)                                                                          |
| T2.10     | **Mantida** como T2.5                                                                                                               |
| T3.1–T3.3 | **Mantidas** juntas na T3.1 (mais o filtro da fila) e na T4.4 (docs)                                                                |
| T4.1      | **Adiada pelo dono em 2026-10-18 — spec seguinte** (prévia "Como chega")                                                            |
| T4.2–T4.3 | **Mantidas** na T4.1 nova                                                                                                           |
| T5.1–T5.3 | **Juntadas** na T5.1                                                                                                                |
| T5.4      | **Mantida** como T5.2, com o script em staging                                                                                      |

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/272-o-email-da-ocorrencia-sai-em-html/ (revisão 2: o HTML vem do
modelo do módulo de notificação). Leia spec.md, plan.md, tasks.md, evidence.md e docs/adr/0110-* antes de começar;
leia também a regra global ~/.claude/rules/rules/email-templates.md, specs/271-* (+ ADR-0108) com o evidence.md, e a
spec 273 em ~/personal/transportada-wt/spec-273/specs/273-a-ocorrencia-tem-dono/ para a porta de dono.
Árvore única: ~/personal/transportada-wt/spec-272 (branch work/spec-272); nada fora dela. Uma task por vez, na ordem
do tasks.md. Antes do código: rebase em origin/staging.
Modelos: T0.3 🧠 → opus (validar a ADR-0110 revisão 2 com architect antes de qualquer código) · Fase 2 → executor
model=sonnet (T2.1 haiku) · Fase 3 → executor model=sonnet · Fase 4 → executor model=sonnet (T4.2 e T4.4 haiku) ·
Fase 5 → sonnet · revisão final → code-reviewer model=sonnet e security-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Teste antes da implementação. Cada task de código fecha com bun run typecheck + lint por app (cwd na app) + script
`test` do package.json da app (nunca `bun test` cru) + commit isolado (`git commit --only <paths>`), evidência em
evidence.md. Task que toca test/integration/** só fecha com `bun --env-file=../../.env.test run test:integration` (de
apps/api-transportada), ZERO skips. Migration: aplica, reverte e reaplica e db:generate esperando no_changes.
Antes de publicar: git fetch, rebase em origin/staging, bun install --frozen-lockfile, gates,
`bunx prettier --check .` na raiz; numeração de spec/ADR/migration contra origin/staging e contra a 273.
Pare e pergunte antes de: rodar o script dos modelos (scripts/occurrence-mail-templates-publish.ts) contra staging ou
produção — é mudança de dados, mostre o dry-run; qualquer merge em main (a 272 só vai a main depois de 269 + 270 +
271); qualquer outra mudança de dados ou consulta que não seja contagem em staging ou produção; deploy da API sem o
worker no mesmo run; a T4.2 sem as respostas Q2/Q3 do dono; e qualquer [NEEDS CLARIFICATION] que surgir.
Decisões já tomadas (evidence.md, ADR-0110 rev. 2): o visual mora no modelo HTML de Notificações (proibido layout em
código); HTML inseguro (script, on*, javascript:, iframe, form) é não utilizável (unsafe_html no lugar de html_body),
com a mesma tabela de casos na API, no validador do painel e no filtro da fila do worker; renderer de uma passada que
escapa só os valores, com o conjunto fechado logoTransportadora/tabelaItens/marcasRodape montado pela API; text/plain
gerado do HTML; modelo sem tag segue o caminho de texto de hoje; assunto "<nome de exibição> · CNPJ <cnpj> — <assunto
do modelo>" idempotente; "De" por buildSenderDisplayName com o nome de exibição SEMPRE (Resend e sandbox), saneado na
API e espelhado no worker; logo por cid: lido de company_logos (has_inline_logo); cargo livre job_title na membership,
PATCH /company-users/:id com users.manage, sem auditoria; OccurrenceOwnerReader nulo para a 273; envio manual com
modelo HTML: texto mantido → HTML, editado → texto; reenvio da 248 como hoje; cinco modelos .html versionados +
script idempotente por chave.
```
