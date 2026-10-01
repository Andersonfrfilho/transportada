# Tasks

Uma task por vez, na ordem. Teste de aceite/contrato **antes** da implementação. Task só fecha com
evidência em `evidence.md` e commit isolado.

⚠️ Arquivo de teste novo entra na **lista explícita** do `package.json` da app — senão não roda.
⚠️ `main.tsx` é arquivo disputado por várias sessões: `git fetch && git rebase origin/staging` antes
de abrir cada fase que o toca (1, 3 e 4), e gates completos antes de qualquer push.
⚠️ Esta spec não toca banco: nenhuma task chama `make migration-test`.

A Fase 1 vem primeiro de propósito: é a mais barata, não depende de nenhuma outra, e é a que tira o
painel do escritório da mão de quem está na rua.

---

## Fase 1 — A conta de campo não abre o painel

> 🤖 Modelo: `sonnet`

- [x] T1.1 Ler `resolveDriverAppRedirect` e os dois chamadores (`main.tsx:545` e `:934`) e registrar
      em `evidence.md` o que cada um passa hoje — em especial se o `isFieldOnlyUser: false` cravado
      em `:934` deixa de ser neutro com a RF-E1 (plan.md § "A conta de campo")
- [x] T1.2 [P] Contrato **de regressão, antes de mudar nada**: `pending-screen` tem precedência,
      `install-screen` vem depois, `/minha-viagem` sem interruptor é `stay`, e `separator` é `stay`
      em `/trips` (CA12, CA13) — estender `test/driver-trip/driver-app-redirect.contract.ts`
- [x] T1.3 [P] Contrato dos casos novos: conta de campo em `/trips`, `/cte-batches`, `/billing` e na
      raiz devolve `redirect` com interruptor (CA10) e `legacy-home` sem ele (CA11)
- [x] T1.4 `isDriverEntry` passa a aceitar qualquer caminho de conta de campo; modo `legacy-home`
      entra em `DriverAppRedirectMode` — só a função pura, nenhum componente ainda
- [x] T1.5 `main.tsx` trata `legacy-home` com `history.replaceState` para `/minha-viagem` (mesma
      origem, nunca `location.replace`) e ajusta o chamador de `:934` conforme a T1.1
- [x] T1.6 [P] Contrato do **motorista que é separador** (`driver` + `separator`): `isFieldOnlyUser`
      é `false`, e `resolveDriverAppRedirect` devolve `stay` em `/trips` — a conta não pode ser levada
      para o app do motorista (CA16, primeira metade). Afirmar antes de a T1.4 mexer na função.
- [x] T1.7 Conferir que `test/driver-trip/legacy-beacon.contract.ts` continua verde — o beacon
      dispara só em `pending-screen`, e esta fase não pode ter mexido nisso
- [x] T1.8 `make check` + commit

## Fase 2 — O mapa de permissão por workspace

> 🤖 Modelo: `sonnet`

- [ ] T2.1 Reconferir **cada uma das 19 linhas** da tabela da RF-A3 contra o código (a página, o
      hook ou o view-model que decide), anotando arquivo:linha. ⚠️ **D3 e D4 já foram conferidas em
      2026-10-01** e o resultado está nas decisões da spec — D3 confirmou `settings.manage`, D4
      descobriu que as duas permissões governam ações e que a API lê com `trip.read`, e a entrada do
      mapa ficou sendo intenção de produto. Reconfira as outras 17 e registre a tabela final em
      `evidence.md`, inclusive onde ela contrariar a spec.
- [ ] T2.2 Extrair `WORKSPACE_NAVIGATION_ITEMS`, `NAVIGATION_GROUPS` e a união de chaves do
      `main.tsx` para `src/modules/shared/workspaceNavigation.constant.ts`, sem mudar comportamento.
      Commit isolado, app subindo antes e depois.
- [ ] T2.3 [P] Contrato: `WORKSPACE_PERMISSIONS` tem entrada para toda chave de grupo, a tabela da
      T2.1 é afirmada entrada por entrada, e `canOpenWorkspace` resolve união ("qualquer uma de") —
      `test/shared/workspace-access.contract.ts` + registro no `package.json`
- [ ] T2.4 `workspaceAccess.service.ts` com `WORKSPACE_PERMISSIONS` (`satisfies`, comentário de
      origem por linha), `canOpenWorkspace` e `visibleWorkspaceKeys`
- [ ] T2.5 Provar o CA05 por **mutação**: acrescentar chave sem entrada no mapa, rodar
      `bun run typecheck`, colar a reprovação em `evidence.md`, desfazer
- [ ] T2.6 `make check` + commit

## Fase 3 — O menu filtra

> 🤖 Modelo: `sonnet`

- [ ] T3.1 [P] Contrato: os cinco itens do `separator` (CA01), `company-admin` sem perda (CA02),
      `fiscal` sem o grupo Usuários (CA03), grupo vazio descartado (CA04) — permissões transcritas
      de `authorization.policy.ts`, com a origem anotada
- [ ] T3.2 Filtrar `group.items` e descartar grupo vazio no render da barra (`main.tsx:654`)
- [ ] T3.3 Esqueleto da barra enquanto `authMeQuery` carrega, e menu mínimo no erro (RF-B3/RF-B4) —
      `@/components/ui/skeleton`, na forma da barra, nunca texto solto nem `null`
- [ ] T3.4 [P] Contrato de "Minha viagem" no menu (RF-E6): aparece com `trip.report`
      (motorista-separador, CA16), **não** aparece para `separator` puro (CA17) nem para `operator`
- [ ] T3.5 "Minha viagem" entra no grupo Operações com entrada `['trip.report']` no mapa; conferir
      que o item some do lugar fora-dos-grupos e que o título da tela continua saindo certo
- [ ] T3.6 `make check` + commit

## Fase 4 — A aterrissagem respeita a permissão

> 🤖 Modelo: `sonnet` (T4.1 é 🧠 — validar com `architect` em `opus` antes de implementar)

- [ ] T4.1 🧠 Desenhar a ordem entre a decisão da conta de campo (Fase 1), o redirecionamento do
      motorista e a aterrissagem: quem decide primeiro, o que acontece quando a conta de campo já foi
      tratada, e como o efeito não entra em laço com a própria navegação nem com `popstate`.
      Registrar a ordem escolhida em `evidence.md` antes de escrever código.
- [ ] T4.2 [P] Contrato de `resolveLandingWorkspace`: permitido fica (`stay`), proibido troca pelo
      primeiro visível (`replace`), nenhum visível é `no-access`, destino igual ao atual não navega
      (CA06, CA08)
- [ ] T4.3 [P] Contrato da **preferência por papel**: `separator` puro aterrissa em `trip` (CA14),
      `separator` + `operator` cai na regra geral (CA15), motorista-separador aterrissa em `trip`
      (CA16, segunda metade), preferência que a conta não pode abrir é ignorada (CA18). Mais o
      contrato da D9: o módulo do mapa não importa `CompanyRole`.
- [ ] T4.4 `resolveLandingWorkspace` e `LANDING_PREFERENCE` em `workspaceAccess.service.ts` (puras,
      sem `window`); `roles` entra só aqui
- [ ] T4.5 Efeito no `main.tsx` com `history.replaceState` (nunca `push`, RF-C3), só na aterrissagem
      sem endereço escolhido — URL digitada permanece e cai na parede (RF-C4, CA07)
- [ ] T4.6 Tela de conta sem acesso (`NoWorkspaceAccess.component.tsx`) com frase, a quem pedir e
      botão de sair; textos em `*.locale.json` pt-BR **acentuado**. Conta de campo nunca chega aqui
      (RF-E5) — afirmar isso no contrato.
- [ ] T4.7 Se a corrida (efeito × mutation × `popstate`) não se provar pura, contrato de hook em
      `test/trip-hooks/` rodado por `bun run test:hooks` — nunca registrar DOM no processo dos
      contratos
- [ ] T4.8 `make check` + commit

## Fase 5 — As três paredes que faltam

> 🤖 Modelo: `haiku` (mecânico: mesmo molde, três vezes)

- [ ] T5.1 [P] Contrato: `/company-settings` sem `settings.manage`, `/nfse-invoices` sem `nfse.read` e
      `/repasses` sem `trip.manage`/`billing.create` resolvem para "sem acesso", e nenhuma consulta dos
      três módulos é habilitada (CA09)
- [ ] T5.2 Parede em `CompanySettings.page.tsx` no molde de `CteBatchWorkspace.page.tsx:75`/`:220`
- [ ] T5.3 Parede em `NfseInvoiceWorkspace.page.tsx`, mesmo molde
- [ ] T5.4 Parede em `ExtraChargeWorkspace.page.tsx` (RF-D3) — **esta fecha exposição real**: hoje a
      tela não tem checagem e a consulta da lista não tem `enabled`, então o separador lê as cobranças
      da empresa. Gate também a consulta, não só o render.
- [ ] T5.5 Contrato de regressão: nenhuma das 15 paredes existentes foi removida (RF-D1)
- [ ] T5.6 `make check` + commit

## Fase 6 — Revisão de design e fechamento

> 🤖 Modelo: `sonnet` (revisão final com `code-reviewer` em `opus`)

- [ ] T6.1 Revisão de design (`web.md` §15, CA14): barra antes e depois, recolhida e expandida, em
      375 px e 1280 px; conferir que grupo escondido saiu do DOM e que o foco por teclado não alcança
      item invisível; **print ao usuário**
- [ ] T6.2 Conferir a tela de sem acesso contra as telas vizinhas (tipografia, espaçamento, botão do
      design system) — primitivo cru ao lado de um do design system é defeito desta task
- [ ] T6.3 Atualizar o `CLAUDE.md` da app: o menu filtra por permissão, o mapa mora em
      `workspaceAccess.service.ts`, e conta de campo não abre o painel por caminho nenhum
      (`code-standart.md` §14, documentação viva). Se a Fase 1 mudou o contrato da ADR-0075 §6,
      registrar a emenda na ADR.
- [ ] T6.4 Revisão final com `code-reviewer` em `opus`; `make check` + commit

---

## Prompt de execução

```text
/oh-my-claudecode:autopilot Crie o worktree com `make worktree NAME=menu-por-permissao` e trabalhe
dentro dele. Execute a spec specs/221-o-menu-mostra-so-o-que-a-pessoa-pode-abrir/ (leia spec.md,
plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fases 1, 2, 3, 4 e 6 → executor model=sonnet · Fase 5 → executor model=haiku ·
T4.1 🧠 → validar com architect em opus ANTES de implementar a Fase 4 ·
revisão final → code-reviewer model=opus.
Teste de contrato ANTES da implementação em toda task. Cada task fecha com typecheck + testes +
commit isolado, evidência em evidence.md. Arquivo de teste novo entra na lista explícita do
package.json da app. Nenhuma task toca banco — não rode make migration-test.
A Fase 1 é a mais urgente e começa por contrato de REGRESSÃO (T1.2, T1.6) antes de mudar a função:
pending-screen precisa manter precedência, e o separador — inclusive o motorista QUE TAMBÉM É
separador (tem trip.manage, logo não é conta de campo) — precisa continuar no painel.
A aterrissagem tem preferência por papel: separador puro começa em /trips, não em NF-e (CA14), e
"Minha viagem" passa a aparecer no menu de quem tem trip.report (CA16/CA17). Papel é lido SÓ no
decididor de aterrissagem; acesso continua por permissão (D9).
T2.1 é leitura de verificação: a tabela da RF-A3 é ponto de partida medido, não verdade — onde o
código contrariar, siga o código e registre em evidence.md.
CA05 se prova por mutação (chave sem entrada reprova o typecheck), não por leitura.
main.tsx é disputado por outras sessões: git fetch && git rebase origin/staging antes das Fases 1,
3 e 4.
As fases 3, 4 e 6 tocam a tela e fecham com revisão de design e print ao usuário (web.md §15).
Pare e pergunte antes de: deploy, remover qualquer parede de página existente, mudar permissão de
papel em authorization.policy.ts, mexer no beacon driver_legacy_served ou na fila antiga do
IndexedDB, qualquer [NEEDS CLARIFICATION].
```
