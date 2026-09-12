# CLAUDE.md

Contexto operacional do monorepo **TransportAdA**. Para regras de processo completas leia
`AGENTS.md`; para o produto e o domínio, `PROJECT.MD` e `docs/spec/constitution.md`.

## Produto

TMS para transportadoras: importa NF-e → organiza em lotes → calcula frete → emite CT-e 4.00 em lote
via `@adatechnology/fiscal-provider` → armazena XMLs fiscais → gera faturas. Genérico e
parametrizável — nenhuma regra ou CNPJ de transportadora específica no código.

**Distribuição é instalação dedicada: um deploy por transportadora** (ADR-0021). A empresa não é
criada em tempo de execução — ela é o ambiente. Não existe `POST /companies` nem ator de plataforma;
`companies.manage` segue reservada e sem consumidor. O isolamento multiempresa (`companyId`,
membership, contratos negativos) **continua invariável**: é capacidade do produto — uma transportadora
costuma ter mais de um CNPJ — e defesa em profundidade, não o modelo comercial.

## Estrutura

```
apps/api-transportada/       Bun.serve + Drizzle + Zod (sem framework HTTP)
apps/worker-transportada/    consumidor RabbitMQ + outbox relay
apps/cron-transportada/      processo one-shot agendado (NF-e, NFS-e, notificações, preço da ANP)
apps/frontend-transportada/  React 19 + Vite 7 (PWA)
apps/frontend-client/        portal do contratante — app separada por segurança (ADR-0050)
docs/spec/                   constitution, architecture, domain-model, fiscal-integration
docs/adr/                    NNNN-titulo.md (0001..0010)
specs/NNN-nome/              spec.md · plan.md · tasks.md · evidence.md
realm/                       contrato versionado do realm Keycloak
```

Não existe `packages/` aqui. Bibliotecas reutilizáveis vão para
`~/Documents/personal/adatechnology-packages`. **Nenhuma app importa código-fonte de outra.**

Cada app tem seu próprio `apps/<app>/CLAUDE.md` com o núcleo normativo daquela app — o Claude Code
carrega esse arquivo sob demanda quando você lê ou edita algo dentro daquele diretório. O histórico
completo (narrativas, defeitos investigados, decisões antigas) de cada app mora em
`docs/ai-context/<app>.md`, para consulta quando o núcleo apontar para lá.

## Comandos

```bash
make bootstrap      # .env a partir do .env.example + bun install --frozen-lockfile
make config         # valida .env, schema de env, Bun 1.3.14, docker compose — pré-requisito
make up / down / ps # infra Docker (`up` cria o bucket do MinIO — idempotente)
make dev            # identity-bootstrap + up + API, worker e frontend em paralelo
make check          # format:check + lint + typecheck + test + build (gate completo)
make migration-test # migration + rollback em Postgres descartável
make smoke          # healthchecks da stack + smoke Playwright
make worker-integration
make e2e-up / e2e-down          # infra dedicada de E2E (.env.test)
bun run --cwd apps/<app> test   # testes de uma app só
```

Não há target isolado de lint/typecheck — use `bun run lint` / `bun run typecheck` na raiz.

Portas (bind em 127.0.0.1): postgres 55432 · rabbitmq 55672/55673 · minio 59000/59001 ·
mailpit 51025/58025 · keycloak 58080 · frontend 53000 · api 53001 · worker 53002.

## Convenções

Sufixos em uso: `.use-case.ts` · `.service.ts` · `.schema.ts` · `.repository.ts` (sempre prefixo
`drizzle-`) · `.routes.ts` · `.port.ts` · `.gateway.ts` · `.error.ts` · `.policy.ts` · `.mapper.ts` ·
`.persistence.ts` · `.types.ts` · `.constant.ts`. Frontend: `.page.tsx` · `.component.tsx` · `.hook.ts` ·
`.query.ts` · `.validation.ts` · `.locale.json` · `.module.css`.

Testes ficam em `test/`, sem colocation: entrypoint fino `test/<area>.contract.test.ts` importando
suítes `test/<area>/*.contract.ts`; `test/fixtures/*.fixture.ts`; `test/integration/*.integration.ts`.
⚠️ A lista de arquivos de teste é **explícita** no `package.json` de cada app — teste novo não roda se
não for adicionado ali.

Use cases e rotas são factories `create*`; classes de repositório são `PascalCase`
(`DrizzleBillingRepository`). Imports ESM sempre com extensão `.js`. TS `NodeNext`, `strict` +
`exactOptionalPropertyTypes`.

## Regras que não se negociam

- Uma task por vez, tirada do `tasks.md` da feature. Nada de implementar com `[NEEDS CLARIFICATION]`
  aberto. Task só fecha com evidência de teste em `evidence.md`.
- Teste de aceite/contrato **antes** da implementação.
- API HTTP usa `Bun.serve`. Importar o addon V8 `uWebSockets.js` é proibido.
- Dinheiro é `Decimal`/`numeric` — nunca float binário.
- `companyId` vem do contexto autenticado, nunca do payload do cliente.
- XML fiscal original é preservado. Nunca logar certificado, senha ou XML sensível.
- Não importar internals `src/sefaz/*` do pacote fiscal — encapsular em gateway da aplicação. Não
  inventar regra legal nem método que o pacote não expõe.
- Frontend é PWA e usa `shadcn/ui`; UI paralela ao design system exige ADR.
- Proibido: deploy em production sem gates e aprovação humana, migration destrutiva automática,
  misturar tenants / ambientes fiscais / buckets.
- `.env` e `.env.test` nunca são commitados nem têm conteúdo exposto.

## A configuração do Railway virou código de projeto

**Config as Code (`deploy/*/railway.json`) está depreciado** — lido até **2026-12-01**, e **serviço
novo não pode optar por ele**. O substituto é `.railway/railway.ts`, um arquivo para o projeto
inteiro, aplicado por `railway config plan` / `railway config apply` (o SDK é a devDependency
`railway`).

⚠️ **O `railway config pull` não traz o que os `railway.json` declaram.** Ele lê o painel, e o painel
nunca soube do arquivo. Medido: o import devolve `builder: RAILPACK` e `config: {}` para os treze
serviços — sem healthcheck, sem o `preDeployCommand` da API (as migrations) e sem o `cronSchedule`
do cron. Aplicar a importação crua desliga os dois **sem erro nenhum**. Está tudo transcrito à mão
no arquivo hoje; quem mexer confere contra os `railway.json`, que continuam no repositório de
propósito.

A ordem de migração de cada serviço, e por que apagar o arquivo primeiro derruba o serviço, está em
`docs/spec/railway.md` § "Migrar um serviço". Duas coisas que o arquivo **não** pode fazer: registrar
domínio próprio (cria-se no painel) e carregar segredo (as variáveis viram `preserve()`).

## Duas sessões, duas árvores

**Sessão que vai escrever código nesta base cria o próprio worktree.** Duas sessões no mesmo
checkout produzem uma família inteira de atrito que não tem nada a ver com o produto: formatação
cruzada, `git add` amplo levando trabalho alheio pela metade, teste sumindo da lista do
`package.json` quando alguém reescreve a linha a partir de cópia antiga, e commit de uma entrando no
push da outra.

```bash
make worktree NAME=spec-066
```

Ele cria `../transportada-wt/<NAME>` na branch `work/<NAME>` a partir de `origin/staging`, liga
`.env` e `.env.test` por **link simbólico** (cópia envelheceria) e instala as dependências. Verificado
que dali rodam os 3611 contratos da API e os 54 de migration contra Postgres.

Publicar de um worktree não passa por checkout de `staging` — ela está ocupada pela árvore principal:

```bash
git fetch && git rebase origin/staging && git push origin HEAD:staging
```

⚠️ `git worktree prune` de vez em quando: worktree apagado à mão deixa registro órfão, e três deles
estavam pendurados aqui de sessões antigas.

## Explorando este repo sem estourar contexto

652 arquivos versionados, 509 `.ts`/`.tsx`, ~67k linhas. Ler tudo direto estoura a janela. Delegue a
exploração para subagentes `Explore` escopados por app — eles leem no contexto deles e devolvem só a
conclusão. Ignore `graphify-out/` (1.9M), `specs/` (672K), `example/`, `realm/`, `tmp/`, `.history/`.
