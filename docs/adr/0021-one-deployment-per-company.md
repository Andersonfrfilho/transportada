# ADR-0021: Um deploy por transportadora, com o isolamento multiempresa mantido

## Contexto

O `PROJECT.MD` deixou o modelo de distribuição em aberto desde o início: "preparada para distribuição
como produto SaaS **ou instalação dedicada**" (`PROJECT.MD:7`). O código foi construído para o caso
mais rígido dos dois — `companyId` em toda entidade, `tenant_context` derivado do token, membership
por empresa, contratos negativos entre empresas obrigatórios (`docs/spec/constitution.md:7`). O
`CLAUDE.md` resumiu isso como "TMS multiempresa (SaaS)".

A ambiguidade só doeu ao especificar a administração de usuários (feature 026). A pergunta "quem cria
a primeira empresa num ambiente novo?" tem respostas opostas nos dois modelos: em SaaS multiempresa
exige um ator de plataforma com `companies.manage`, uma noção de identidade fora de empresa e um
`POST /companies`; em instalação dedicada a pergunta simplesmente não existe.

Sintomas de que o modelo real nunca foi SaaS multiempresa:

- `companies.manage` está declarada (`identity/domain/authorization.policy.ts:7`) e deliberadamente
  **inatribuível** a qualquer papel de empresa (`:38`, `:136`). O tipo `PlatformAuthorizationPolicy`
  existe (`:117-119`), e nenhuma rota jamais declarou `scope: 'platform'`.
- `company-settings.routes.ts` tem `GET`, `GET` de lookup e `PATCH`, nunca um `POST` — a empresa
  sempre foi pressuposta, nunca criada pelo produto.
- O semeador de identidade recusa fora de `local`/`test`
  (`database/local-identity-seed.service.ts:21`), e `docs/spec/railway.md:91-92` registra a criação do
  primeiro usuário como passo manual por ambiente.
- ADR-0020 já raciocina em cima de "a instalação de cada transportadora contrata o que quiser".

## Decisão

### 1. O modelo de distribuição é instalação dedicada: um deploy por transportadora

Cada transportadora recebe o seu próprio conjunto de ambientes, com banco, fila, bucket, realm e
certificado próprios. A empresa não é criada em tempo de execução — ela **é** o ambiente, definida
no provisionamento.

Consequências diretas:

- **Não existe** `POST /companies` nem ator de plataforma. `companies.manage` continua reservada,
  sem consumidor, como está hoje.
- O arranque de um ambiente é provisionamento idempotente: garante a empresa única a partir da
  configuração do ambiente e o primeiro `company-admin`. Depois disso, criar usuário é função do
  produto (feature 026).
- Residência de dado, keyring, ambiente fiscal e bucket são por cliente por construção, e não por
  disciplina de query.

### 2. O isolamento multiempresa continua invariável

Nada é removido. `companyId`, membership, `tenantContext.resolveCompany` e os contratos negativos em
`test/*-schema/tenant-safety.contract.ts` permanecem **obrigatórios**, pelas mesmas três razões de
sempre:

- Uma transportadora tem mais de um CNPJ com frequência — filial, empresa do grupo, operação em
  outro estado. "Uma empresa por deploy" é sobre cliente, não sobre CNPJ.
- É defesa em profundidade já paga: um bug de query sem filtro deixa de ser vazamento entre clientes
  e vira, no pior caso, vazamento entre CNPJs do mesmo dono.
- É o seam que os testes usam para provar escopo sem subir banco.

O que muda é o rótulo, não a regra: multiempresa passa a ser **capacidade** do produto, não o modelo
comercial.

### 3. A topologia do Railway é por cliente

O projeto `transportada` no Railway, com `staging` e `production`, é a instalação de **um** cliente.
Cliente novo é projeto novo, com o mesmo pipeline e as mesmas variáveis — nunca um ambiente
compartilhado, nunca um segundo tenant dentro do mesmo banco.

## Consequências

- `CLAUDE.md` e `README.md` deixam de anunciar "SaaS" e passam a descrever instalação dedicada.
- A feature 026 perde a fase de ator de plataforma e ganha uma tarefa de provisionamento.
- Onboarding de cliente novo é trabalho de infraestrutura, não de produto. O custo por cliente é
  maior que em SaaS multiempresa, e isso é aceito em troca de isolamento físico de dado fiscal e
  certificado digital.
- Se o modelo mudar para SaaS multiempresa no futuro, o caminho está preservado: basta implementar
  `scope: 'platform'` sobre `companies.manage` e um `POST /companies`. Nenhuma migration é necessária.
