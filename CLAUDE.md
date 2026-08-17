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
docs/spec/                   constitution, architecture, domain-model, fiscal-integration
docs/adr/                    NNNN-titulo.md (0001..0010)
specs/NNN-nome/              spec.md · plan.md · tasks.md · evidence.md
realm/                       contrato versionado do realm Keycloak
```

Não existe `packages/` aqui. Bibliotecas reutilizáveis vão para
`~/Documents/personal/adatechnology-packages`. **Nenhuma app importa código-fonte de outra.**

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

## api-transportada

Módulo de domínio = até 4 camadas em `src/<modulo>/`:

- `presentation/` — `*.routes.ts` (`defineRoute`), `*.schema.ts` (Zod). Única camada que vê `Request`/`Response`.
- `application/` — `*.use-case.ts`, `*.service.ts`, `*.port.ts`.
- `domain/` — regras puras, `*.error.ts`, `*.policy.ts`. Sem I/O.
- `infrastructure/` — `drizzle-*.repository.ts`, `*.mapper.ts`, `*.gateway.ts`.

Módulos: `billing`, `companies`, `cte-batches`, `cte-issuance`, `fleet`, `freight`,
`freight-calculations`, `freight-rules`, `identity`, `nfe-documents`, `nfe-imports`, `operations`,
`storage`, `health`.
Transversais: `config`, `database`, `http`, `logging`, `server`, `shared`.

Fluxo de request: `src/main.ts` (composition root) → `server/server.service.ts` (`Bun.serve`, limite
2 MiB) → `http/request-handler.service.ts` (correlation-id, 1 MiB → 413, CORS) →
`http/router.service.ts`: autentica → `matchRoute` → `tenantContext.resolveCompany` → `authorize` →
`route.execute` → `parse` (Zod) → `handle` → use-case → repositório.

**Multi-tenant:** Bearer JWT (Keycloak/JWKS) → identidade externa por issuer+subject →
`tenantContext.resolveCompany` busca membership ativo; sem membership → 403. Todo repositório recebe
`context.companyId` e filtra por ele. Testes de isolamento em `test/*-schema/tenant-safety.contract.ts`
são obrigatórios em qualquer mudança de query.

**Recuperação de senha:** `POST /password-resets` e `POST /password-resets/confirm` são as **únicas
rotas anônimas** da API. A primeira responde `204` sempre — login inexistente, desabilitado e válido
são indistinguíveis, e é isso que impede a enumeração de usuários; o cliente do frontend engole
falha de rede pelo mesmo motivo. O código é de uso único, expira em 15 minutos e sai por
`password-reset-delivery.v1` no worker, com o envelope carregando só referência (`requestId`,
`userId`) e AAD `transportada:password-reset:v1:${companyId}:${requestId}` — amarrado ao **pedido**,
não ao usuário como no convite, porque a mesma pessoa abre vários pedidos. O Keycloak é só o
depósito da senha (admin SDK): `resetPasswordAllowed` segue `false`, e o link "Esqueci minha senha"
do tema de login aponta para `/recuperar-senha`, tela nossa. ⚠️ As duas rotas **não têm rate limit**
— não existe limitador nesta API; achado registrado em `docs/SECURITY.md`.

**Busca automática de notas:** `GET`/`PUT`/`DELETE /company-settings/scheduled-distribution`
(`settings.manage`, escopo `company`) leem e alternam o opt-in; o corpo é o mesmo
`ScheduledDistributionStatus` que `GET /nfe-imports/distribution` devolve em `scheduled`, para a aba
Remota e a tela de configurações não contarem histórias diferentes. A paridade é contrato
(`test/companies/scheduled-distribution-parity.contract.ts`).

**Cliente da fatura:** é o **tomador do frete**, quem paga — nunca um papel de participante da nota.
Quem é o tomador está configurado em `cte_emission_profiles.taker` (`0` remetente, `3` destinatário)
e a emissão grava o valor resolvido em `cte_issuance_payloads.taker_tax_id`/`taker_legal_name`; o
faturamento junta por `(company_id, attempt_id)` pelo seam `buildBillingTakerJoin()`. O relatório da
fatura continua mostrando o `recipient` por linha — ali o destinatário é o destino da carga, não o
cliente. ADR-0028.

**Cancelar fatura devolve o CT-e:** `billing_invoice_items.cancelled_at` marca a linha na mesma
transação que muda o status da fatura (`releaseInvoiceItems`), e a unicidade do documento é o índice
parcial `billing_invoice_items_active_cte_document_unique` — vale só para linha não cancelada. Todo
caminho de elegibilidade lê pelo mesmo recorte: `buildActiveInvoiceItemJoin()` na listagem e na
prévia, `cancelled_at is null` na reserva e nas duas expressões da coluna "Faturado" da tabela de
CT-es. A fatura cancelada continua com o detalhe dela no relatório.

**O R$/km do veículo é derivado, não digitado:** `costPerKilometer` sai de
`fleet/domain/vehicle-cost.policy.ts`, ao lado de `monthlyFixedCost` e com a mesma forma —
`preço do combustível ÷ consumo médio`, arredondado na quarta casa, **somado** a
`otherCostsPerKilometer`. A coluna homônima `cost_per_kilometer` **não existe mais** — a spec 038 a
removeu no único `drop column` do repositório, com `rollback.sql` que devolve a coluna mas não os
valores. O que o veículo persiste é `fuel_type` — do catálogo `FUEL_TYPES`, com a unidade como
atributo do produto (GNV em m³, os outros quatro em litro) — e `other_costs_per_kilometer`. `POST` e
`PUT` de veículo **recusam** `costPerKilometer` no corpo pelo `strict()`.

O preço efetivo é `ajuste da empresa ?? referência da ANP da UF`, por produto
(`companies/domain/fuel-price.policy.ts`), e `GET`/`PUT`/`DELETE
/company-settings/fuel-prices[/{produto}]` (`settings.manage`, escopo `company`) leem e alternam o
ajuste. ⚠️ `fuel_price_references` é a **única tabela do produto sem `company_id`**, de propósito: a
publicação semanal da ANP é dado público de mercado, idêntico para toda empresa da instalação, sem
PII e sem efeito fiscal. `test/fleet-schema/tenant-safety.contract.ts` a lista como exceção
declarada — se ela sumir da lista, o contrato passa a cobrar o tenant. A leitura do preço dentro da
listagem de veículos é **uma por empresa**, resolvida antes do `map` da página, nunca por linha.

**O `{{periodo}}` da NFS-e é digitado, não derivado:** o domínio não calcula janela nenhuma a partir
das notas — `buildNfseDescription` recebe `period` e o repassa como veio, e em branco a variável sai
vazia. `nfse-period.service.ts` **não existe mais**. O campo entra no corpo de
`POST /nfse-service-invoices` (`period`, ≤ 60 caracteres) e na digital do pedido: corrigir o período
e repetir a chave é pedido novo, não replay. A ordem em que a regra automática pode nascer — escolher
a data-fonte, o recorte e o que fazer com a seleção que atravessa dois recortes — está no comentário
acima de `buildNfseDescription`, em `nfse-invoices/domain/nfse-description.service.ts`. No frontend o
campo "Período do serviço" abre vazio a cada emissão (`useNfseEmissionDialog.hook.ts`) e entra na
chave da prévia; em branco ele é **omitido** do corpo, porque ausente e `''` dizem a mesma coisa à API.

**Banco:** schemas em `src/database/*.schema.ts`, agregados em `database.schema.ts`. Migrations SQL
versionadas em `drizzle/`. `bun run db:generate --name x` · `db:check` · `db:migrate` · `db:seed:local`.
O startup **não** roda migrations; rollback é manual, ao lado da migration.

## worker-transportada

RabbitMQ via `@adatechnology/rabbitmq-provider` — **sem BullMQ/Redis**. Topologias em
`src/messaging/`, cada trilho com main/retry/dead: `nfe-import.v1`, `nfe-distribution.v1`,
`cte-issuance.v1` (+ `synthetic.v1`, proibido em production). Padrão de nome:
`${QUEUE_PREFIX}.<rota>.v1.{main,retry,dead}.{exchange,queue}`.

Envelopes Zod versionados (`*-envelope.schema.ts`), backoff por política, idempotência via tabela
`processed_messages`, outbox relay (polling 1s, lease 30s) sobre `processing_outbox` e
`cte_issuance_outbox`.

Entrypoint `src/main.ts` → `startWorkerRuntime`. Cada consumer é `start*Consumer` em `src/runtime/`,
recebe `{config, logger, provider}` e devolve `{cancel()}`; a lógica fica em `src/<contexto>/application/`.
Dependências injetáveis via `WorkerRuntimeDependencies` — é assim que os contract tests substituem
RabbitMQ e banco.

⚠️ O schema Drizzle das tabelas consumidas é **duplicado por cópia** no worker — oito arquivos em
`src/database/` (`processing`, `cte-issuance-execution`, `mdfe-issuance-execution`,
`nfse-issuance-execution`, `nfe`, `identity`, `invitation-delivery`, `password-reset-delivery`), e
outras nove no cron. Mudou tabela na API? confira as cópias — migrations só rodam na API.

## cron-transportada

Processo **one-shot**: um CronJob sobe `src/main.ts` a cada janela, ele roda um ciclo e sai —
não há loop nem agendador embutido. Sai com código 1 só quando alguma empresa falhou; não pegar o
advisory lock é no-op limpo. A conexão Postgres é pinada em **um socket** (`max: 1`) para o lock de
sessão valer por todas as transações do ciclo.

`config/environment.schema.ts` resolve qual job rodar (`CRON_JOB`), `src/job-registry.ts` mapeia o
nome para a função. Quatro jobs:

- `nfe.distribution.pull` — seleciona as empresas elegíveis e enfileira uma importação
  `source: 'distribution'`, `triggeredBy: 'automation'` na `processing_outbox`, reusando o relay e o
  consumidor de distribuição que já existiam.
- `nfse.status.pull` — reconcilia NFS-e com a prefeitura: consulta a situação de cada nota pendente,
  arquiva XML e PDF no bucket na autorização, grava a rejeição com código e mensagem. Aqui o cron
  **processa** em vez de enfileirar (desvio deliberado da regra geral): o consumidor seria dele
  mesmo. Quem decide a transição é o banco — todo `UPDATE` de liquidação projeta o status de origem
  no `WHERE` e devolve `RETURNING`; sem linha, a escrita inteira é abandonada. O XML é o documento
  fiscal e sem ele a nota não liquida; o PDF é conveniência, e sua falta só é registrada.
- `notification.schedules.run` — varre o que venceu (fatura a vencer, NFS-e rejeitada) e reenfileira
  em `notification.v1`, a mesma trilha que a API publica e o worker consome.
- `fuel.price.pull` — baixa o resumo semanal da ANP (XLSX lido por código nosso, ZIP +
  `inflateRawSync`, sem dependência nova — ADR-0033) e grava `fuel_price_references` por produto e
  UF. Como o cron de NFS-e, aqui ele **processa** em vez de enfileirar. Roda **sábado**
  (`0 9 * * 6`): a semana da ANP vai de domingo a sábado e **dá nome ao arquivo**, então a URL é
  derivada da semana que contém o dia de hoje — domingo pediria uma semana publicada seis dias
  depois, e daria 404 todo ciclo. Reexecutar a mesma semana não duplica linha: a chave natural
  `(product, state, week_ending_on)` é a idempotência do ciclo. É o único job que sobe sem chaveiro,
  sem bucket e sem tenant — a planilha é dado público de mercado.

O bloco de configuração de NFS-e (chaveiro, bucket, `NFSE_PROVIDER_BASE_URL`) só é resolvido quando
`CRON_JOB` é `nfse.status.pull` — o deploy da busca de notas continua subindo sem nenhum deles, e o
de NFS-e falha no boot se faltar algum.

**O endereço da Nota RP é um só, e a NFS-e é trilho de produção** (ADR-0035). O provedor publica um
servidor (`https://www.notarp.com.br/api/v2`) e não tem homologação; quem separa uma instalação da
outra é a credencial selada por empresa, não a URL. Por isso `NFSE_PROVIDER_BASE_URL` substituiu o par
`_HOMOLOGATION`/`_PRODUCTION` — um teste em cada app falha se os nomes voltarem — `FISCAL_ENVIRONMENT`
não escolhe mais endereço de NFS-e (segue valendo para CT-e e MDF-e), e o `deploy.yml` publica
`cron-nfse` **em produção**, não em staging.

⚠️ `nfe-distribution-pull/domain/distribution-eligibility.policy.ts` é **cópia** de
`api-transportada/src/companies/domain/distribution-eligibility.policy.ts` — mesma regra, mesmo
vocabulário de razões, duas apps que não importam código uma da outra. Mudou a regra de um lado?
mude do outro; `test/companies/scheduled-distribution-parity.contract.ts` guarda a paridade do corpo
servido pelas duas rotas, e `test/nfe-distribution-pull/eligibility-reasons.contract.ts` guarda o
vocabulário no cron.

⚠️ O trilho de NFS-e do cron carrega quatro **cópias por valor** do worker:
`nfse-status-pull/infrastructure/nota-rp-v2.client.ts`, `.../nfse-fiscal-gateway.ts`,
`nfse-status-pull/application/nfse-credential-secret.service.ts` e
`src/database/nfse-reconciliation.schema.ts` (mais `config/cryptographic-configuration.schema.ts`,
cópia do parser de chaveiro). São reduções, não espelhos — aqui só se consulta e se baixa documento.
O que guarda a paridade é comportamento, não diff de texto:
`test/nfse-status-pull/nota-rp-parity.contract.ts` fixa a mesma tabela de tradução de resposta e de
causas de falha que o cliente do worker. Mudou o vocabulário da Nota RP de um lado? mude do outro.
O AAD do envelope tem de ser idêntico ao que selou:
`transportada:nfse-credential:v1:${companyId}:${credentialId}`.

⚠️ O catálogo `FUEL_TYPES` é **cópia por valor** nas três apps que o usam —
`api-transportada/src/shared/fuel.constant.ts`,
`frontend-transportada/src/modules/shared/fuel.constant.ts` e
`cron-transportada/src/fuel-price-pull/domain/fuel.constant.ts` — com a mesma lista, na mesma ordem
e com a mesma unidade por produto (`gnv` em `cubic-metre`, os outros quatro em `litre`). A unidade é
atributo do produto, não coluna: guardá-la por linha abriria a porta para duas linhas do mesmo
produto discordarem. Quem guarda a paridade são os contratos `test/fuel-catalog/catalog.contract.ts`
(API), `test/shared/fuel-catalog.contract.ts` (frontend) e
`test/fuel-price-pull/catalog.contract.ts` (cron) — mudou produto ou unidade de um lado? mude dos
três. Uma linha de GNV lida como litro entra no banco sem reclamar de nada.

## frontend-transportada

React 19.2 + Vite 7.3 + TanStack Query 5 (`retry: false`, `staleTime` 30s). **Sem router**: navegação
manual em `src/main.tsx` (`pushState` + `popstate` + `sessionStorage`). **Sem Tailwind e sem zod** —
`tailwind-merge`/`clsx`/`cva` estão no package.json mas não são usados; `cn()` é reimplementado em
`src/lib/utils.ts`; validação é type guard manual em `*.validation.ts`.

Módulos em `src/modules/`: `billing`, `company-settings`, `cte-batch`, `cte-issuance`, `foundation`,
`freight`, `identity`, `nfe-workspace`, `operations`, `shared`. `shared/` concentra client HTTP +
validação + view-model. Um client HTTP **por módulo** (`shared/<modulo>Client.service.ts`), com `fetch`
injetado por dependência. Auth via `KeycloakAuthProvider`.

Tokens de design em `:root` de `src/styles/index.css` (`--color-*`, `--font-*`, `--space-1..16`), tema
escuro único. Design system caseiro em `src/components/ui/`. Estilos por módulo em `*.module.css`.

Todo container de tela usa `width: var(--layout-width)` — nenhum módulo declara largura própria, para
o cabeçalho da aplicação e os painéis fecharem na mesma borda. Detalhes em `docs/frontend/layout.md`,
contrato em `test/design-system/layout-width.contract.ts`.

Todo campo (`input`, `textarea`, gatilho de select) tira altura, padding e corpo de texto dos tokens
`--field-height`/`--field-padding`/`--field-font-size` (e suas variantes `*-compact`) — nenhum módulo
inventa altura própria. Detalhes em `docs/frontend/fields.md`, contrato em
`test/design-system/field-metrics.contract.ts`.

Todo checkbox usa `@/components/ui/checkbox` — `<input type="checkbox">` cru é **proibido** em
`src/**/*.tsx` e o contrato `test/design-system/checkbox.contract.ts` falha se algum reaparecer.
Props, variante com/sem rótulo e estado indeterminado em `docs/frontend/checkboxes.md`.

Todo ícone vem de `@/components/ui/icon` — `<svg>` cru é **proibido** em `src/**/*.tsx` fora de
`src/components/ui/` e o contrato `test/design-system/icon.contract.ts` falha se algum reaparecer.
Tamanho por token (`--icon-size-sm`/`--icon-size-md`), cor por `currentColor`, botão só de ícone com
`aria-label` obrigatório. Nomes disponíveis e como criar um novo em `docs/frontend/icons.md`.

Todo botão que hospeda ícone alinha ícone e rótulo por **uma regra global** (`button:has(svg)` em
`src/styles/index.css`), nunca por CSS de módulo: classe de botão com ícone não declara `display`
(a especificidade venceria a regra e devolveria o ícone colado ao rótulo) nem `gap` fora da escala
`--space-*`. Regra completa em `docs/frontend/buttons.md`, contrato em
`test/design-system/button.contract.ts`.

Toda altura de controle sai de `--control-height` / `--control-height-compact` (derivados de
`--field-height*`): as duas classes de tamanho do botão e todo botão só de ícone, que é quadrado
nesse valor. Nenhum módulo declara controle quadrado com medida literal em `rem` — era assim que
"Novo veículo" (2,5rem), o botão de colunas (2,25rem) e a barra de filtro (2,4rem) davam três
alturas na mesma fileira. Contrato em `test/design-system/control-height.contract.ts`.

Todo campo de seleção usa `@/components/ui/select` — `<select>` nativo é **proibido** em
`src/**/*.tsx` e o contrato `test/design-system/select.contract.ts` falha se algum reaparecer.
Contrato de props, teclado e ARIA em `docs/frontend/selects.md`.

Todo painel que abre sobre a tela (lista do select, calendários) é renderizado em portal no
`document.body` e posicionado pelo hook `useFloatingLayer` — dentro de modal ou tabela rolável o
`position: absolute` era recortado pelo `overflow` do ancestral. Contrato em
`test/design-system/floating-layer.contract.ts`, regra na seção "Camada flutuante" de
`docs/frontend/selects.md`.

Tabelas com muitas informações seguem `docs/frontend/data-tables.md` (contrato obrigatório: ordenação,
filtros multi-valor, filtro simples + avançado com grupos E/OU aninhados, reordenação/visibilidade de
colunas persistida em `localStorage`, seleção em massa, teste de contrato). Duas referências vivas: o
módulo `nfe-workspace` (tabela "Notas") — hook `useNfeDocumentTable.hook.ts` +
`AdvancedFilterBuilder.component.tsx` — e o módulo `cte-batch` (tabela de CT-es) — hook
`useCteItemTable.hook.ts`, que acrescenta paginação por cursor, soma decimal da seleção entre páginas
e status escondido por padrão (`CTE_ITEM_DEFAULT_HIDDEN_STATUSES`).

Todo filtro ativo aparece como pílula removível vinda de `@/components/ui/filter-pills`
(`components/ui/filter-pills.tsx`) — nenhum módulo desenha a sua. Os descritores ficam em
`shared/<modulo>FilterPills.service.ts` (sem tradução, com `formatDay` injetado) e a remoção por campo
em `clearFilterField` do hook; no modo simples o badge do filtro usa `countFilterPills(pills)`, e a
pílula que resume vários filtros declara o próprio peso em `count`. Regra completa na
§ 8 de `docs/frontend/data-tables.md`, contrato em `test/design-system/filter-pills.contract.ts`.

Toda contagem de filtros ativos no botão de ícone vem de `@/components/ui/count-badge` — o badge fica
**ao lado do ícone, dentro do botão**, e a regra global `button:has([data-count-badge])` em
`src/styles/index.css` troca a largura fixa do botão por `width: auto` + `padding-inline`. No canto
(`position: absolute`) ele ficava pendurado por cima da borda e era recortado pelo `overflow` da barra
de ações. Regra na § 9 de `docs/frontend/data-tables.md`, contrato em
`test/design-system/count-badge.contract.ts`.

Todo estado de carregamento (`isLoading` de query, gate de página, tabela, painel, diálogo)
renderiza um esqueleto de `@/components/ui/skeleton` com a mesma forma do conteúdo real que ele
antecede — nunca texto solto ("Carregando…") nem `null`, que é o que causa o piscar da tela ao
trocar para o conteúdo. Regra completa e como compor por tipo de tela em `docs/frontend/loading.md`,
contrato em `test/design-system/skeleton.contract.ts`.

Texto pt-BR nos `*.locale.json` vai **acentuado**. O contrato `test/shared/locale-accents.contract.ts`
varre por glob todo `src/modules/*/locales/*.locale.json` que não seja `.en.` e falha se achar palavra
de uma blocklist de formas que não existem sem acento (`nao`, `possivel`, `numero`, `pagina`, …).
Módulo novo entra na varredura sozinho; palavra nova que escapar se acrescenta à blocklist.

Fora de produção o ícone da aba troca para `public/icons/icon-work-in-progress.svg` — o 🚧 vem à
frente da marca, dentro do próprio desenho, porque na aba o ícone é o que aparece antes do título; o
título fica só com o nome, para não haver dois avisos lado a lado. A tela abre com uma faixa de
ambiente. Quem decide é
`VITE_APP_ENV` (`local` · `staging` · `production`), resolvido em
`shared/deploymentEnvironment.service.ts`: ausente ou desconhecido cai em `production` — variável
esquecida no painel não pode fazer a instalação do cliente pedir desculpas. Build de dev (`vite dev`)
cai em `local` sem configurar nada. Contrato em `test/shared/deployment-environment.contract.ts`,
que também guarda o `ARG VITE_APP_ENV` do `Dockerfile` — sem ele o valor não entra no bundle.

A tela de login **não é desta app**: é o tema Keycloak em `deploy/keycloak/theme/`, montado pelo
`compose.yaml` e copiado pelo `deploy/keycloak/Dockerfile` — o mesmo diretório nos dois caminhos.
Herda de `base` (não de `keycloak.v2`, que arrasta o PatternFly) e reescreve `template.ftl` e
`login.ftl`; os tokens de design são **cópia por valor** de `src/styles/index.css`, porque o tema
não importa código nosso. Mudou cor, fonte ou escala aqui? copie lá. Regra completa em
`docs/frontend/login-theme.md`.

Envs: `VITE_API_URL`, `VITE_APP_ENV`, `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`,
`VITE_KEYCLOAK_CLIENT_ID`.

## Documento fiscal: o CNPJ tem letra

CNPJ alfanumérico (IN RFB 2229/2024, NT Conjunta DF-e 2025.001, em produção desde 01/07/2026):
**`[A-Z0-9]{12}[0-9]{2}`** — letra só nas doze posições da base, os dois dígitos verificadores
continuam numéricos. **O CPF não mudou**: onze dígitos, sempre. A chave de acesso herda o documento
nas posições 7 a 20, então o padrão dela é `^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$` (cUF+AAMM, o CNPJ do
emitente, e daí em diante só dígito). Todo CHECK de chave no banco é esse — `nfe`, `cte-issuance`,
`billing`, `mdfe`, `nfse`, `fleet`, `digital-certificate`.

**A forma canônica é sem máscara e em CAIXA ALTA.** Canonicalizar é `normalizeTaxId`: tira `.`, `/`,
`-` e espaço, e sobe a caixa. Onde ela mora:

- `api-transportada/src/shared/tax-id.service.ts` — **único** ponto da API que importa
  `CNPJ_PATTERN`/`CHAVE_PATTERN`/`normalizeTaxId` de `@adatechnology/fiscal-provider`, para o `~` do
  Postgres, o `regex` do Zod e o XML não divergirem. Ali também ficam `CPF_PATTERN`,
  `CNPJ_ROOT_PATTERN` (a raiz alfanumeriza junto — é prefixo do documento), `TAX_ID_PATTERN`,
  `DOCUMENT_FILTER_PATTERN` e `parseTaxIdValue` para fronteira que não é Zod (query string, rota).
- `api-transportada/src/shared/tax-id.schema.ts` — `buildTaxIdSchema` / `buildOptionalTaxIdSchema`.
  A ordem importa: `.transform(normalizeTaxId)` **antes** do `.refine(pattern)`, senão a minúscula
  vinda do formulário é recusada antes de ter chance de subir a caixa.
- `worker-transportada/src/shared/tax-id.service.ts` — reexporta do mesmo pacote fiscal.
- `frontend-transportada/src/modules/shared/taxId.service.ts` — aqui a regra é **reescrita**, porque
  o bundle não carrega o pacote fiscal; `test/shared/alphanumeric-tax-id.contract.ts` é o que
  garante que as duas dizem a mesma coisa. Campo de CNPJ **nunca** leva `inputMode="numeric"` — o
  teclado do celular não tem letra — e o `onChange` canonicaliza enquanto se digita.

**O que continua sendo por comprimento, e está certo:** `toParticipante`
(`cte-issuance/domain/cte-payload.builder.ts`) escolhe `cnpj` em 14 caracteres e `cpf` em 11. O CNPJ
alfanumérico continua tendo 14 — a discriminação sobrevive à IN, e trocá-la por padrão seria
mudança sem ganho.

**O que precisou virar guarda de conjunto:** `formatDacteDocumentNumber`
(`cte-issuance/domain/dacte-format.policy.ts`) canonicaliza e testa `CNPJ_PATTERN` **antes** de
`CPF_PATTERN`. Filtrar por dígito, como antes, deixava onze dígitos num CNPJ de três letras e
imprimia o documento sob a máscara de CPF.

Cobertura ponta a ponta em
`api-transportada/test/integration/alphanumeric-cnpj-end-to-end.integration.ts`: nota de emitente
alfanumérico → lote → frete → payload de CT-e → DACTE → fatura. Ele **não** cobre assinatura e
transmissão (o XML nasce no worker, com certificado e rede).

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

## Explorando este repo sem estourar contexto

652 arquivos versionados, 509 `.ts`/`.tsx`, ~67k linhas. Ler tudo direto estoura a janela. Delegue a
exploração para subagentes `Explore` escopados por app — eles leem no contexto deles e devolvem só a
conclusão. Ignore `graphify-out/` (1.9M), `specs/` (672K), `example/`, `realm/`, `tmp/`, `.history/`.
