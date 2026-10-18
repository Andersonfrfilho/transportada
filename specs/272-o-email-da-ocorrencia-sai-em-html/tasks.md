# Tasks — 272 O e-mail da ocorrência sai em HTML

> Cada task responde: **Mecânica?** (tudo descrito) · **Aceite por comando?** (tsc/teste/`make check`).
> Duas respostas "sim" → `haiku`. Gate de toda task: `bun run typecheck` (`tsc --noEmit`) + lint por app (cwd na app) +
> testes da app (script `test` do `package.json`, nunca `bun test` cru) + commit isolado (`git commit --only`).
> Escalada: gate falhou 2× → sobe um nível e registra em `evidence.md`.
> Teste novo entra no agregador e na lista explícita do `package.json` da app.
> Task que toca `test/integration/**` só fecha com `bun --env-file=../../.env.test run test:integration` (de
> `apps/api-transportada`) **sem nenhum skip**.
> Task com migration: aplica, reverte e reaplica (`make migration-test` ou Postgres descartável) e `db:generate` com
> `no_changes` depois.
> Worktree: `~/personal/transportada-wt/spec-272` (FS do Linux, branch `work/spec-272`). Nada é feito fora dela.
> Antes de começar: rebase em `origin/staging` (a 271 precisa estar lá; está desde o PR #266).

## Fase 0 — Contrato antes do código

> 🤖 Modelo: `sonnet` (T0.2 é 🧠)

- [x] **T0.1** `sonnet` — Conferir contra `origin/staging` cada linha do `evidence.md` § Levantamento e os fatos do
      `plan.md` § Contexto. Conferir também: (a) a API do Resend aceita anexo inline com `content_id` (doc oficial via
      `document-specialist`/context7) e o nodemailer o `cid`; (b) o `icon-192.png` do painel é a marca TransportAdA da
      prévia (senão, plano B do D4); (c) como o reenvio da 248 (`resend-contractor-reply-request.use-case.ts`) monta o
      texto e o HTML hoje; (d) o caminho e a permissão da rota de prévia para escolher o da rota D8; (e) o rótulo
      pt-BR de `CompanyRole` e a ordem do catálogo (cargo vazio cai nele); (f) se API e worker saem no mesmo deploy
      (plan § Publicação, passo 2); (g) para o cargo (D10): o repositório que o `update-company-user-profile` usa para
      gravar e ler, onde `serializeCompanyUser` monta a resposta, se o guarda `companyUsersResponse.validation.ts`
      reprova chave desconhecida, e que o caso de uso continua sem auditoria. Divergência vira nota no `evidence.md` antes de seguir.
- [x] **T0.2** 🧠 `opus` — Escrever a ADR-0110 e validar com `architect` D1–D13 do `plan.md` (montador puro sem
      biblioteca, `cid:` × URL pública, marcas pelo `APP_BASE_URL`, ponto `signer` e regra do "De" com o nome de
      exibição sempre (D12 do dono; a 273 RF7 herda), D6 do bloco intacto, colunas D9, cargo na membership editado por
      `users.manage` sem auditoria (D10), ordem API+worker). Ajuste aprovado entra no `plan.md`. **Outras tasks herdam
      este contrato.** (Concluída: aprovada com ajustes, ADR aceita em 2026-10-18; `evidence.md` § T0.2.)

## Fase 1 — Painel tolerante (vai a produção ANTES da API)

> 🤖 Modelo: `haiku`

- [ ] **T1.1** `haiku` — (Ajustado na T0.2) Teste que prova a tolerância: a prévia (`readPreview`) com `html` do layout
      novo e `fromDisplayName`, e a mensagem do histórico (`toMessage`) com `fromDisplayName`/`signerKind`, passam pelos
      guardas de `occurrenceConversationClient.service.ts`; sem as chaves também. As guardas já ignoram chave extra (T0.1
      (h)): se o teste passa sem mudar código, a task fecha só com o teste. Ler/tipar as chaves fica para a Fase 4.
- [ ] **T1.2** `haiku` — (Ajustado na T0.2) Só o teste que prova a tolerância: usuário da empresa com `jobTitle` (texto
      ou `null`) e sem a chave passa por `toCompanyUser` (`companyUsersResponse.validation.ts`; lista, detalhe e resposta
      do `PATCH`). A guarda já ignora chave extra (T0.1 (g)); nenhuma mudança de código esperada.
- [ ] **T1.3** `sonnet` — (Ajustado na T0.2) Se a T1.1 e a T1.2 passaram sem mudar código de produção, não há deploy:
      registrar no `evidence.md` e seguir. Se alguma mudou código, publicar a Fase 1 (PR → `staging` → `main`) **com
      aprovação humana** e registrar o commit em produção; a Fase 2 não vai a `main` antes disto.

## Fase 2 — API: o montador e os dados

> 🤖 Modelo: `sonnet` (T2.1, T2.3, T2.8 e T2.9 → `haiku`)

- [ ] **T2.1** `haiku` — Migration aditiva D9 com as **quatro** colunas (`signer_kind` + CHECK, `signer_user_id`,
      `layout_version`, `has_inline_logo`; `from_display_name` já existe e **não** entra — Ajustado na T0.2) + schema
      Drizzle (API e espelho do worker) + `rollback.sql`. (Ajustado na T0.2 (architect)) Os três CHECKs da invariante
      (plan D9): `direction <> 'outbound' or ((layout_version is null) = (from_display_name is null))`,
      `(layout_version is null) = (signer_kind is null)`, `(signer_kind in ('operator','owner')) = (signer_user_id is not
null)`; `signer_user_id` sem FK. Aceite: aplica, reverte, reaplica com as linhas atuais passando nos CHECKs; teste
      de migration que recusa linha incoerente; `db:generate` → `no_changes` nas duas apps.
- [ ] **T2.2** `sonnet` — Teste antes (golden files e casos do `plan.md` § Testes); depois o montador puro:
      `occurrence-mail-layout.constant.ts`, `occurrence-mail-layout.types.ts`, `occurrence-mail-layout.policy.ts`,
      `occurrence-mail-layout-blocks.policy.ts`, `occurrence-mail-items-table.policy.ts`. Desenho de referência: a
      função `render()` de `desenho-aprovado.html` (nesta pasta), traduzido para tabelas e estilos inline. (Ajustado na
      T0.2 (architect)) D6 sem marcador: `renderContractorMail` devolve também `itemLinesBlock`; o parágrafo igual a ele
      vira a tabela. Aceite: golden files, teste de forma, escape, 200 itens < 100 KB, parada sem nota sem o grupo "Nota
      fiscal" (critério 8 — só aqui, no montador), observação contendo texto parecido com o bloco não vira tabela,
      bloco vazio não casa, corte com "e mais N itens" mostra as mesmas `shown` linhas.
- [ ] **T2.3** `haiku` — Teste antes (tabelas de casos); depois `occurrence-mail-sender-name.policy.ts` (D5) e
      `occurrence-mail-subject.policy.ts` (D7). O "De" usa sempre o nome de exibição (D12): o `sender_name` do Resend
      nunca aparece (critério 5 da spec). (Ajustado na T0.2 (architect)) Tabela de casos do saneamento do "De" (`\p{Cc}`,
      U+2028/2029, bidi, `<>"\,;`, espaços, total > 200 corta o nome da pessoa primeiro) — a mesma tabela será espelhada
      no worker (T3.1); prefixo com nome de exibição colapsado e cortado em 80; `applySubjectPrefix` idempotente na
      tabela de casos (assunto já prefixado não ganha segundo prefixo).
- [ ] **T2.4** `sonnet` — Leituras: `findOccurrenceTarget` com o CNPJ da contratante, `findCarrierIdentity` (nome de
      exibição, razão social, CNPJ, cidade, UF, `hasLogo`), `findOperatorSigner` (nome + cargo da membership, senão o rótulo do
      papel, numa consulta; depende da T2.9), porta
      `OccurrenceOwnerReader` com a implementação nula; `APP_BASE_URL` opcional no schema de env da API. (Ajustado na
      T0.2 (architect)) Contrato da porta: `findEligibleOwner({ companyId, occurrenceId, kind }) → { userId, name,
jobTitle?: string } | undefined` (elegibilidade da ADR-0109 §7 é da implementação; `kind` vem de `item.source` em
      `findOccurrenceTarget`); função pura `resolveSignerJobTitle({ jobTitle, directRoles })` usada por
      `findOperatorSigner` e pelo leitor de dono; sem cargo e sem papel direto → `jobTitle` ausente (linha omitida). Integração das
      leituras (outra empresa não aparece). (Ajustado na T0.2) Inclui: `contractorTaxId` repassado por
      `findOccurrenceTarget` e o rótulo "CNPJ"/"CPF" (plan D12); `COMPANY_ROLE_LABELS` com `satisfies` e o contrato de
      paridade contra `identity.locale.json` do painel (plan D11; `operator` = "Operação"), papel = primeiro na ordem de
      `COMPANY_ROLES` entre os diretos.
- [ ] **T2.5** `sonnet` — Envio manual e automático pelo montador: assinante (`operator`; `owner` pela porta; `team`),
      D6 (parágrafo igual a `itemLinesBlock` vira tabela, sem marcador — Ajustado na T0.2 (architect); teste: observação
      com texto parecido não vira tabela), D7, `from_display_name` e colunas D9 gravadas. Teste do critério 13 da spec por injeção de um leitor de dono falso. Integração: manual e
      automático gravam as colunas; Resend e sandbox gravam o nome de exibição em `from_display_name` (nunca o
      `sender_name`).
- [ ] **T2.6** `sonnet` — (Ajustado na T0.2, plan D9-b) Reenvio da 248: `findOriginalRequest` lê `layout_version`,
      `signer_kind`, `signer_user_id` e o autor da mensagem original; o reenvio passa o assinante ao envio (ator continua
      quem reenvia). Original com layout → mesmo assinante (nome e cargo lidos agora) e assunto gravado **sem** reaplicar
      o prefixo (título = trecho depois de `· CNPJ <cnpj> —`); original anterior à 272 → autor como `operator` (ou
      `team` se automático) e prefixo aplicado uma vez; pessoa sem vínculo → `team`. Sai sempre em `layout_version = 1`.
      (Ajustado na T0.2 (architect)) O assinante pessoa exige membership ativa; original `owner` também exige a
      elegibilidade da 0109 pela porta; senão → `team`. A leitura do título vira função pura testada com nome de
      exibição contendo "—". Testes do prefixo não duplicado e integração do critério 10.
- [ ] **T2.7** `sonnet` — (Ajustado na T0.2: a rota nova D8 caiu; a task passa a ser a prévia existente) A prévia
      `POST …/conversations/contractor/mail-preview` devolve em `html` o HTML do layout novo, `fromDisplayName` e (Ajustado
      na T0.2 (architect)) `fullSubject` só para exibir — `subject` continua a parte do modelo, sem prefixo —, do `body`
      editado ou do texto sugerido; na primeira chamada (sem `body`), `inlineLogo?: { mimeType, contentBase64 }`, sem
      mudar o `html`. Balde `OCCURRENCE_MAIL_PREVIEW_RATE_LIMIT` (120/300 s, 429). Contratos: 404 outra empresa, 403 sem
      permissão, nada gravado, 429 no balde próprio sem tocar o de mensagens; critério 12 (o `html` da prévia é igual ao
      `body_html` gravado para o mesmo texto e operador); o `subject` da prévia reenviado ao `POST` gera exatamente um
      prefixo; `inlineLogo` de outra empresa nunca vem. Opção registrada (decidir só depois da medição da T5.1): extrair
      caso de uso interno que só monta o HTML, sem buscar destinatários e cópia a cada pausa.
- [ ] **T2.8** `haiku` — Documentação viva: OpenAPI das respostas alteradas (prévia com `fromDisplayName` e o 429), `apps/api-transportada/CLAUDE.md`
      (uma linha sob o e-mail da ocorrência), `docs/ai-context/api-transportada.md`, `.env.example` e `.railway/railway.ts`
      (`APP_BASE_URL` como `preserve()`); OpenAPI do `PATCH /company-users/:id` com `jobTitle`.
- [ ] **T2.9** `haiku` — Cargo, dados (D10): migration aditiva `user_company_membership_job_title` (`varchar(80)` nula + CHECK) + schema Drizzle + `rollback.sql`; teste antes e política pura `company-user-job-title.policy.ts` (tabela
      de casos do `plan.md` § Testes). Aceite: aplica, reverte, reaplica; `db:generate` → `no_changes`; testes da
      política (Ajustado na T0.2 (architect): a política também remove bidi, U+202A–U+202E e U+2066–U+2069, com caso na
      tabela). Feita antes da T2.4.
- [ ] **T2.10** `sonnet` — Cargo, rota (D10): contratos antes (critério 14 da spec: ausente não altera, `null`/`""`
      limpa, 81 caracteres → 400, quebra de linha saneada, sem `users.manage` → 403, usuário de outra empresa → 404 —
      BOLA; corpo só com `jobTitle` não chama o Keycloak — dublê do gateway sem chamada); depois `jobTitle` no schema
      `.strict()` do `PATCH /company-users/:id` (conta para o "ao menos um campo"), no caso de uso (método novo
      `updateJobTitle` no repositório, `UPDATE` por `(user_id, company_id)`; só `jobTitle` → sem gateway; sem auditoria,
      seguindo o perfil) e na resposta por `MEMBERSHIP_COLUMNS` → `CompanyUserRecord` → `toCompanyUserView`
      (`company-user.policy.ts`; não em `serializeCompanyUser` — Ajustado na T0.2). Integração: gravar e ler de volta;
      outra empresa não é tocada.

## Fase 3 — Worker: "De" com nome e logo embutido

> 🤖 Modelo: `sonnet` (T3.3 → `haiku`)

- [ ] **T3.1** `sonnet` — Teste antes; depois o "De" por `from_display_name` nos dois transportes (Resend:
      `from_display_name`, com `settings.senderName` só para mensagem anterior à 272; sandbox: `{ name, address }`), com o
      saneamento espelhado do da API (Ajustado na T0.2 (architect): mesma tabela de casos da T2.3 — `\p{Cc}`, U+2028/2029,
      bidi, `<>"\,;`, espaços, 200). `findMessageById` lê `direction` e o worker só usa `from_display_name` em
      `outbound` (sugestão do architect adotada). Antes do código, confirmar na doc oficial do Resend (context7) se ele
      codifica nome não ASCII no `from` (RFC 2047) ou se o gateway precisa codificar; registrar no `evidence.md`.
      Critério 5 (Resend com o nome de exibição, não o `sender_name`) contra o dublê do gateway e critério 6 (sandbox
      com nome) contra o dublê do nodemailer.
- [ ] **T3.2** `sonnet` — Teste antes; depois a parte inline do logo: `drizzle-company-logo.reader.ts`, anexo com
      `content_id` no Resend e `cid` no sandbox quando `has_inline_logo`; logo ausente → envia sem a parte e loga só
      `messageId` e o motivo.
- [ ] **T3.3** `haiku` — `docs/ai-context/worker-transportada.md` e `apps/worker-transportada/CLAUDE.md` (seção da 268:
      o "De" do sandbox tem nome).

## Fase 4 — Telas

> 🤖 Modelo: `sonnet` (T4.3 → `haiku`)

- [ ] **T4.1** `sonnet` — Teste antes; depois a área "Como chega" no diálogo de envio manual: `iframe` com `sandbox` (sem
      `allow-scripts`) e `srcDoc` do HTML, atualizado pela prévia existente com atraso de 400 ms ao editar (no 429, mantém
      o último HTML); "De" e assunto acima. Tipa e lê `html`/`fromDisplayName` da prévia.
      O texto editável não muda. Acessível por teclado; título do `iframe`. (Ajustado na T0.2 (architect)) Exibe
      `fullSubject` e nunca o devolve no `POST` (devolve `subject`). Logo: cria uma URL `blob:` uma vez de `inlineLogo`
      e troca `cid:company-logo` só no `srcDoc`; prova no navegador (`read_page`/geometria por `javascript_tool`, sem
      screenshot intermediário) que o logo carrega no `iframe` sandbox. Se o `blob:` do pai não carregar na origem
      opaca, usar `sandbox="allow-same-origin"` sem `allow-scripts` e registrar na ADR-0110 §8; se nem assim, fica o
      `alt` (fallback do RF12) — registrar qual caso valeu no `evidence.md`.
- [ ] **T4.2** `sonnet` — Teste antes; depois o campo "Cargo" em `CompanyUserEditDialog.component.tsx` (texto, até 80,
      contador, ajuda "Aparece na assinatura dos e-mails de ocorrência", vazio limpa), enviado no `PATCH` existente; o
      cargo abaixo do nome na lista de usuários (`UserAdministration.page.tsx`); erro 400 no campo.
- [ ] **T4.3** `haiku` — Locales pt-BR/en das telas novas (prévia "Como chega" e campo "Cargo").

## Fase 5 — Fechamento e publicação

> 🤖 Modelo: `sonnet`

- [ ] **T5.1** `sonnet` — Gates completos: `bun run typecheck`; lint por app; script `test` de `apps/api-transportada`,
      `apps/worker-transportada` e `apps/frontend-transportada`; contrato da API
      `bun --env-file=../../.env.test test --timeout 120000`; integração
      `bun --env-file=../../.env.test run test:integration` sem skip; `bunx prettier --check .` na raiz; auditoria §15
      (PII em log, `Promise.all` × `allSettled` nas leituras da view, tamanho do HTML).
- [ ] **T5.2** `sonnet` — `code-reviewer` e `security-reviewer` em paralelo sobre `origin/staging...HEAD` (escape de todo
      valor no HTML, injeção de cabeçalho no "De", BOLA na prévia, no logo de outra empresa e no `jobTitle` de
      usuário de outra empresa, cargo fora de log, `iframe` sem script).
      Corrigir e reverificar.
- [ ] **T5.3** `sonnet` — Conferir localmente no Mailpit (268) por texto: enviar manual e automático, ler o HTML e os
      cabeçalhos pela API do Mailpit (`/api/v1/message/<id>`, `/headers`): "De" com nome, assunto com prefixo, parte
      inline do logo, sem faixa de resposta, assinatura com o cargo preenchido em Usuários (e com o rótulo do papel
      quando vazio). Um screenshot só no fim, como prova. Evidência.
- [ ] **T5.4** `sonnet` — Publicação **com aprovação humana em cada passo** (plan § Publicação): rebase em
      `origin/staging`, `bun install --frozen-lockfile`, gates, conferir numeração de spec/ADR/migration contra
      `origin/staging` e contra a 273 (Ajustado na T0.2 (architect): 272 e 273 geram `snapshot.json` do mesmo pai
      `20261017041702_…` — quem chegar depois a `staging` regenera migration e snapshot); API + worker juntos →
      `staging` → conferir no Mailpit de staging → **um envio real pelo Resend** (nome não ASCII no "De", logo inline)
      antes de `main` → `main` (depois de 269 + 270 + 271); telas → `staging` → `main`. Atualizar o `CLAUDE.md` da raiz
      (um parágrafo da 272).

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/272-o-email-da-ocorrencia-sai-em-html/ (leia spec.md, plan.md,
tasks.md e evidence.md antes de começar; leia também specs/268-*, 269-*, 271-* (+ ADR-0108) com os evidence.md, e a
spec 273 em ~/personal/transportada-wt/spec-273/specs/273-a-ocorrencia-tem-dono/ para o ponto signer).
Árvore única: ~/personal/transportada-wt/spec-272 (FS do Linux, branch work/spec-272, criada de origin/staging);
nada fora dela. Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0 → executor model=sonnet (T0.2 🧠 → opus: escrever a ADR-0110 e validar com architect antes de
qualquer código) · Fase 1 → executor model=haiku (T1.3 sonnet) · Fase 2 → executor model=sonnet (T2.1/T2.3/T2.8/T2.9 haiku;
T2.9 antes da T2.4) ·
Fase 3 → executor model=sonnet (T3.3 haiku) · Fase 4 → executor model=sonnet (T4.3 haiku) · Fase 5 → sonnet ·
revisão final → code-reviewer model=sonnet e security-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Teste antes da implementação. Cada task fecha com bun run typecheck + lint por app (cwd na app) + script `test` do
package.json da app (nunca `bun test` cru) + commit isolado (`git commit --only <paths>`), evidência em evidence.md.
Task que toca test/integration/** só fecha com `bun --env-file=../../.env.test run test:integration` (de
apps/api-transportada), ZERO skips. Migration: aplica, reverte e reaplica e db:generate esperando no_changes.
Antes de publicar: git fetch, rebase em origin/staging, bun install --frozen-lockfile, gates,
`bunx prettier --check .` na raiz; conferir numeração de spec/ADR/migration contra origin/staging e contra a 273.
Pare e pergunte antes de: qualquer merge em main (T1.3, T5.4 — o painel tolerante vai a produção ANTES da API, e a
272 só vai a main depois de 269 + 270 + 271); qualquer mudança de dados ou consulta que não seja contagem em staging
ou produção; deploy da API sem o worker no mesmo deploy (plan § Publicação passo 2); e qualquer
[NEEDS CLARIFICATION] que surgir.
Decisões já tomadas (evidence.md): o modelo continua texto (271 recusa HTML) e o servidor monta o HTML em volta, com
multipart text+html; cores fixas da plataforma, tabelas e estilos inline, sem biblioteca; logo da transportadora
embutido por cid: lido de company_logos; marcas TransportAdA e Ada por APP_BASE_URL do painel; assunto
"<nome de exibição> · CNPJ <cnpj> — <assunto do modelo>"; resumo Nota fiscal / Partes / Registro; {{linhasItens}} vira
tabela (no manual só se o bloco ficou intacto); faixa de resposta só com Reply-To; assinatura operador / dono (porta
OccurrenceOwnerReader, nula até a 273) / equipe, com o cargo livre do usuário na empresa (job_title na membership,
editado em Usuários por users.manage na rota PATCH /company-users/:id, sem auditoria como o perfil; vazio → rótulo do
papel); "De" por buildSenderDisplayName com o nome de exibição SEMPRE (Resend e sandbox; o sender_name do Resend não
aparece), e a 273 RF7 herda essa regra.
```
