# Passagem de bastão — o que falta da 252 e da 262 (2026-10-12)

> Escrito para quem continuar em **outro computador ou outra sessão**. Tudo o que foi feito está em `origin/staging`; o que
> falta é **produção** (PRs, com aprovação humana) e passos que só o usuário faz. Leia este arquivo, depois
> `evidence.md` § "T6.1 — fechamento" (quadro de SHAs, roteiro do 1º ciclo e runbook) e `tasks.md`.
> **Nunca escreva neste arquivo, em commit, log ou chat o valor de uma chave de API.**

## 1. Onde estamos

### Spec 252 — importação de feriados da FeriadosAPI

- **Produção:** entregue em três PRs mesclados — #155 `a158bd687` (painel tolera `origin`), #156 `4d01307c4` (duas migrations,
  catálogo de jobs, API, worker, cron) e #159 `63b55be61` (telas, `origin`, cartão de status, aviso no app do motorista).
  Deploys verdes. A rotina `holiday.provider.pull` está **pausada** e **sem chave** em produção.
- **Em aberto (usuário):** Q3 (plano/cota) e Q4 (termos: a FeriadosAPI permite guardar os dados no nosso banco? não achamos a
  cláusula). **Sem a Q4 resolvida, não ligar em produção.**

### Spec 262 — a chave e o orçamento da FeriadosAPI se configuram no painel

| Fase                                                           | SHA de cabeça em `origin/staging` | Deploy                                                                 |
| -------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| 1 — painel aprende antes (permissão e `credential_unreadable`) | `a5868f369`                       | run `37994557029`, verde após reexecução (Docker Hub)                  |
| 2 e 3 — migration `holiday_provider_settings` + API            | `602f16e55`                       | run `38007640528`, verde                                               |
| 5 — telas (bloco da chave, interruptor, manchetes)             | `408aedf77`                       | run `38170135676`, verde após reexecução (smoke do motorista)          |
| 6.1b — correções da revisão final (CORS, chave fora do cache…) | `28174ded8`                       | coberta pelo run da Fase 4 (o próprio run `38254541060` caiu no smoke) |
| 4 — worker lê a chave do banco + documentação viva da T6.1     | `acb68a0f9`                       | run `38255596289`, **verde, todos os jobs de deploy**                  |

Outras mudanças de staging que o PR de produção pode querer levar: CORS `Content-Disposition` (`60f59de90`, outra sessão) e a
mudança de CI para **6 shards** de `integration-api` (`c1a0fed8f`).

**Estado de staging (2026-10-12):** a chave foi gravada **pela tela** (Configurações → Calendário → Chave da FeriadosAPI); o
cartão mostra "Aguardando a primeira execução". A rotina continua **pausada** — despausar é passo do usuário (ver §3).
**Estado de produção:** nada da 262. Produção tem as migrations da 252, **não** a `holiday_provider_settings`; o worker de
produção é o da 252 (sem token, a rotina nem é registrada).

## 2. Regras do usuário que valem para quem continuar

- Responder e escrever em **pt-BR**. Commits com `--no-verify`, caminhos explícitos, nunca `git add -A`, nunca `git stash`,
  `reset`, `amend` nem `rebase --skip`; trailer `Co-Authored-By` conforme o ambiente.
- **Produção nunca sem aprovação explícita do usuário**, PR a PR. A migration em produção tem aprovação própria. Quem abre o PR
  **não mescla sozinho** sem o "pode mesclar" do usuário; nunca habilitar auto-merge sem pedido.
- **Nunca ler o banco de produção.** Nunca digitar, ler ou imprimir uma chave/senha: o usuário cola a chave **na tela**. O
  arquivo `~/Desktop/token-feriado.rtf` do usuário guarda a chave em texto puro: não abrir, não copiar; o usuário deve apagá-lo
  ou movê-lo para o gerenciador de senhas.
- **Gate A:** conferir só o **nome** de `FERIADOS_API_TOKEN` no worker (staging e produção), com saída que nunca contenha valor
  (`railway variables --service worker --environment <env> --json | jq -r 'keys[] | select(startswith("FERIADOS_API"))'`,
  conferindo antes que `--json` existe na versão do CLI; ou a aba Variables, que mascara). O `railway variables` comum imprime o
  valor e queima o segredo. `railway config apply` é **sempre** do usuário.
- **Tela só sobe com print aprovado.** Os prints desta spec ficaram fora do repositório (scratchpad da sessão) e podem ter se
  perdido; para regenerar, use o smoke de prints `apps/frontend-transportada/test/spec-262-painel-prints.smoke.spec.ts`
  (build real + `vite preview` do binário da app, dados fictícios, 375/768/1280 px, claro e escuro).
- Gates por task: contrato vermelho antes, typecheck, lint com a app como cwd, teste pelo **script** `test` do `package.json`
  (nunca `bun test` cru), integração em Postgres que responda (o Docker local costuma estar quebrado: use um Postgres nativo
  descartável), mutação, `bun run format:check` na raiz **com a árvore limpa** (a CI reprova o commit, não a árvore: `git add`
  de todo arquivo que o prettier tocou).

## 3. O que só o usuário faz (nenhum bloqueia código)

1. **Despausar `holiday.provider.pull` em Operações (staging)** e acompanhar o **primeiro ciclo** pelo cartão e pelo roteiro do
   `evidence.md` § "T6.1 — fechamento". Esperado: sem "chave ilegível" nem "fornecedor recusou"; o contador do mês sobe
   (carga inicial estimada em ~138 requisições; manutenção ~23/mês). Chave do plano gratuito: as cidades do interior voltam como
   "fora do plano" (esperado; o gratuito cobre nacionais, estaduais e as 27 capitais; interior exige o Developer, R$ 39/mês,
   5.000 requisições/mês, 60 req/min nos dois).
2. **Q3 e Q4 da 252** (plano e termos) antes de ligar em produção.
3. **Revisão de design da 262 (T6.1c):** comparar a tela real de staging com os prints aprovados (checklist de 12 itens em
   `evidence.md` § T6.1).
4. **Gate A em produção** e, depois do worker em `main`, o **`railway config apply`** da T4.4.
5. **Aprovar cada PR de produção** e a migration.
6. Opcional: segredo no repositório para a CI fazer login no Docker Hub (ver §6).

## 4. Produção da 262 — o que fazer, em ordem

Método já usado nos três PRs da 252 (#155, #156, #159; leia os corpos com `gh pr view <n> --json body` como molde): ramo novo a
partir de `origin/main`, `git cherry-pick -x` dos commits de **uma** camada em ordem cronológica de staging, **verificar** que o
que ficou nos caminhos exclusivos da spec é igual ao de `origin/staging` (`git diff origin/staging origin/<ramo> -- <caminhos>`
vazio, diferenças justificadas), gates, PR **rascunho** contra `main`, aprovação, merge, conferir o Deploy de produção (a CI
leva ~22 min; 4–6 shards de integração são o gargalo). Descubra os commits com
`git log origin/main..origin/staging --reverse --format='%h %s' --grep='262'` e confira por arquivo (`git show --stat`): staging
carrega trabalho de **outras specs** (247–264…) que **não** entra.

Camadas (cada uma é um PR; **um por vez**, com Deploy verde entre eles):

1. **PR-A — painel tolerante (Fase 1).** `credential_unreadable` no catálogo do painel e `holiday-import.configure` em
   `COMPANY_PERMISSIONS`/grupos/locales, com as listas de pendentes autofechantes
   (`PENDING_API_FAILURE_OUTCOMES`, `PENDING_API_PERMISSIONS`). Sem isto em produção, a API com a permissão nova faz
   `/auth/me` ser recusado e **todo `company-admin` perde o painel** (D10).
2. **PR-B — migration + API + catálogo do cron (Fases 2 e 3).** **Aprovação própria do usuário** (aplica
   `holiday_provider_settings` no `preDeployCommand`). Leva o commit da T3.1 inteiro (apaga as listas de pendentes e restaura a
   igualdade estrita nos contratos do painel — por isso o PR-A precisa estar **em produção antes**), as correções da API da
   T6.1b (CORS `Retry-After`, constantes, log do cofre) e, de preferência, o `Content-Disposition` no CORS. **Ordem das
   migrations:** a da 262 é `20261009223052`; as da spec 263 em staging são `20261010…`. Se a da 263 chegar a `main` antes da
   da 262, o migrador pode pular a mais antiga e o pre-deploy falha alto (`migration-completeness`): promover na ordem do
   timestamp ou confirmar o comportamento do migrador antes. Rodar `make migration-test` (ou `bun run db:test` num Postgres
   nativo) e `db:generate` = `no_changes` sobre `main`.
3. **Gate A em produção** (só nomes). Se a variável existir com valor, a chave entra no banco **antes** do worker (pela tela do
   PR-D ou por um `PUT` que não ecoa nada: chave lida com `read -s`, corpo por stdin; exige Bearer de `company-admin`).
4. **PR-C — worker (Fase 4, T4.1–T4.3) + documentação viva.** Um push só. **Antes** do PR-B em produção o worker cairia em
   `unexpected_error` a cada ciclo (a tabela não existe). Conferir **um ciclo** sem `token_missing` indevido.
5. **PR-D — telas (Fase 5) + a parte do painel da T6.1b** (chave fora do estado do React Query, contratos de paridade
   painel↔API, manchete "chave nova", diálogo de remover, acessibilidade, `autoComplete="new-password"`). **Prints aprovados**
   (regerar se preciso). Só depois do worker em produção: gravar a chave pela tela antes não teria efeito.
6. **T4.4:** remover `FERIADOS_API_TOKEN` e `FERIADOS_API_MONTHLY_REQUEST_BUDGET` de `.railway/railway.ts` **somente depois** de
   a chave estar no banco de staging **e** de produção, do worker em `main` e de um ciclo conferido; anotar em
   `docs/spec/railway.md` que o `destroy` desses dois no `plan` passa a ser esperado. O `railway config apply` é do usuário e
   **nunca** de um checkout de staging antes disso (apagaria a variável do worker de produção que ainda a lê).

⚠️ **Cuidado com a armadilha da promoção em PRs separados.** Contratos de paridade do painel **leem o código da API**
(`test/shared/job-catalog.contract.ts`, `test/frontend-contract.test.ts`, `test/identity/permission-matrix.contract.ts`,
paridade das chaves de `GET provider-settings`). Uma promoção anterior em dois PRs deixou a `main` vermelha e pulou os
deploys (#144). Na 262 o desenho evita isso com as listas autofechantes; mesmo assim, **antes de pedir aprovação de cada PR**,
rode o `bun run test` do painel e o contrato da API **sobre o ramo do PR**. Se aparecer vermelho de paridade, junte as camadas
afetadas em um PR só.

## 5. Como acompanhar um Deploy (comandos)

```bash
gh run list --branch main --limit 3 --json databaseId,headSha,status,conclusion
gh run view <id> --json status,conclusion,jobs --jq '{c:.conclusion,bad:[.jobs[]|select(.conclusion=="failure" or .conclusion=="cancelled")|.name],deploys:[.jobs[]|select(.name|startswith("deploy"))|{n:.name,c:.conclusion}]}'
gh run rerun <id> --failed        # uma vez, só para falha de infraestrutura (ver §6)
```

`deploy-frontend` precisa de `deploy-api`: a API sobe antes do painel (por isso a ordem das camadas importa). A branch
`main` é protegida: só por PR, com os status checks verdes; `gh pr update-branch` cuida de ficar atrás de `main`; conflito de
cherry-pick repetido (commits do PR já mesclado) some com `git rebase --onto origin/main <base-antiga> <ramo>`.

## 6. Flakes e dívidas conhecidas (não são defeito da 252/262)

- **Docker Hub:** os jobs de integração puxam a imagem do Postgres sem autenticação e caem com
  `auth.docker.io … Client.Timeout exceeded`. Reexecutar com `--failed`; se persistir, esperar ~10 min. Mitigação
  (login no Docker Hub ou espelho no GHCR) pede um segredo do usuário.
- **Smoke do painel:** `Port 53110 is already in use` — reexecutar o job.
- **Smoke do app do motorista (`conversation.smoke.spec.ts`):** corridas na API de demonstração
  (`route.fulfill: Fetch response has been disposed`, `DEMO_API_NOT_READY_ON_53912`). Já derrubou dois deploys; merece correção
  própria no auxiliar `conversation-smoke.helper.ts`.
- **`integration-api` cancelado pelo teto de 15 min:** era o limite do job com 4 shards. Com 6 shards e pesos refeitos
  (`c1a0fed8f`, só em `staging`) o shard mais lento cai de ~14 min para ~10 min. **Levar à `main` é outro PR.**
- **Índice `nfe_addresses (company_id, participant_id)`:** a migration `20261009160300` já está em produção (a 252). Nada a
  fazer.
- **Dívidas da revisão final da 262 que viraram tarefa:** `DELETE` da chave com `If-Match`, scrubber do Sentry para mensagens de
  erro de driver, log/captura de `ApiError` 5xx, divisão de arquivos de teste acima de 200 linhas.
- **Limpeza:** muitos worktrees `.claude/worktrees/agent-*` e branches `work/252-*`, `work/262-*` locais podem ser apagados
  depois de cada PR mesclado (`git worktree remove`, `git worktree prune`). O worktree principal da sessão antiga sumiu.

## 7. Checklist final de "terminamos"

- [ ] Rotina despausada em staging, 1º ciclo conferido (cartão, desfecho, contador, feriados importados no calendário).
- [ ] Revisão de design da 262 (T6.1c) feita pelo usuário.
- [ ] Q3 e Q4 da 252 respondidas.
- [ ] PR-A, PR-B, Gate A, PR-C, PR-D em produção, cada um com Deploy verde e aprovação.
- [ ] T4.4 aplicada pelo usuário (`railway config apply`) e `railway.ts` sem as duas variáveis.
- [ ] `tasks.md` com T4.4, T6.1b e T6.1c marcadas e `evidence.md` § "T6.1 — fechamento" atualizado com os SHAs de `main`.
- [ ] Rotina ligada em produção (despausar em Operações) e primeiro ciclo conferido por lá.
