# 055 — tarefas

Uma task por vez. Teste de aceite/contrato **antes** da implementação. Task só fecha com evidência em
`evidence.md`.

⚠️ Todo arquivo de teste novo entra na lista explícita do `package.json` da app — suíte que não é
importada pelo entrypoint (`test/<área>.contract.test.ts`) simplesmente não roda, e passa verde.

---

## Fase 1 — O separador tem papel

> 🤖 Modelo: `opus` 🧠 (a fase inteira é autorização e migration)

Esta fase vem primeira porque é a que **bloqueia o go-live**: sem ela, pôr o separador na tela
significa dar-lhe `fleet.manage`, que apaga veículo e motorista.

### T001 🧠 — `trip.manage` nasce, e as rotas de viagem migram para ela

`TRIP_MANAGE_POLICY` (`trip.routes.ts:40`) hoje é `fleet.manage`, nas cinco rotas de escrita (linhas
102, 122, 138, 154, 166). A permissão nova entra em `TRANSPORTADA_PERMISSIONS` ao lado de `trip.read`
e `trip.report`, que já estão lá sem consumidor, e `company-admin` e `operator` a recebem **no mesmo
commit** — senão quem cria viagem hoje para de criar amanhã. `mdfe.manage` da linha 185 não se toca.

- **Arquivos:** `apps/api-transportada/src/identity/domain/authorization.policy.ts`,
  `apps/api-transportada/src/trips/presentation/trip.routes.ts`,
  `apps/frontend-transportada/src/modules/identity/queries/useAuthMe.query.ts`,
  `apps/api-transportada/test/authorization.contract.test.ts`
- **Aceite:** as cinco rotas exigem `trip.manage`; `company-admin` e `operator` a têm; nenhum papel
  perde permissão que tinha; o catálogo do frontend lista `trip.manage`.
- **Verificação:** `bun run --cwd apps/api-transportada test` · `bun run typecheck`

### T002 🧠 — O papel `separator` entra no catálogo e no CHECK

`['trip.read', 'trip.manage', 'invoices.read', 'fleet.read']` — enxerga frota e nota, escreve viagem,
não toca em cadastro, faturamento, CT-e nem configuração. Papel novo é linha nova em
`COMPANY_ROLES` (`identity.schema.ts:29-37`), no `membership_roles_role_check`
(`identity.schema.ts:131`) e no `COMPANY_ROLE_LIST` do convite (`user-invitation.schema.ts:34`).
Migration aditiva, com `rollback.sql` ao lado — o rollback devolve o CHECK antigo e **falha** se
houver membership com o papel novo, em vez de apagar o vínculo de alguém.

- **Arquivos:** `apps/api-transportada/src/database/identity.schema.ts`,
  `apps/api-transportada/drizzle/<timestamp>_separator_role/{migration.sql,rollback.sql}`,
  `apps/api-transportada/src/identity/domain/authorization.policy.ts`,
  `apps/api-transportada/test/authorization.contract.test.ts`
- **Aceite:** `separator` recusado em toda rota de escrita de frota, de faturamento e de CT-e (`403`);
  aceito nas cinco de viagem e nas de leitura de nota e de frota. Teste **negativo** por rota, não só
  positivo.
- **Verificação:** `bun run --cwd apps/api-transportada test` · `make migration-test`

---

## Fase 2 — A câmera pode abrir

> 🤖 Modelo: `sonnet` (T003 é 🧠 — é cabeçalho de segurança)

### T003 🧠 — `camera=(self)`, e só a câmera

`server.ts:29` hoje é `'Permissions-Policy': 'camera=(), geolocation=(), microphone=()'`, e
`camera=()` nega a própria origem: `getUserMedia` falha antes de qualquer diálogo. Passa a
`camera=(self), geolocation=(), microphone=()`. O contrato tem **duas metades**, e a segunda é a que
importa em seis meses: falha se `camera` voltar a `()`, e falha se `geolocation` ou `microphone`
deixarem de ser `()`.

O achado vai para `docs/SECURITY.md` com data — abrir capacidade de dispositivo é decisão que se
audita, não linha que se muda em silêncio.

- **Arquivos:** `apps/frontend-transportada/server.ts`,
  `apps/frontend-transportada/test/shared/security-headers.contract.ts`, `docs/SECURITY.md`
- **Aceite:** o contrato falha nos dois sentidos; a CSP e os outros três cabeçalhos ficam idênticos.
- **Verificação:** `bun run --cwd apps/frontend-transportada test` · `bun run --cwd
apps/frontend-transportada build`

---

## Fase 3 — A chave resolve

> 🤖 Modelo: `sonnet`

### T004 — Extrair a chave do que a câmera devolve

Função pura, no frontend: 44 caracteres canônicos passam direto; URL de consulta entrega a chave de
`p=` (primeiro segmento antes do `|`) ou de `chNFe=`; qualquer outra coisa devolve ausência, nunca
erro. O padrão é o `CHAVE_PATTERN` que já existe em `modules/shared/taxId.service.ts` —
`^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$`, alfanumérico nas doze posições do CNPJ do emitente. **Não
reescrever com `\d{44}`:** isso recusaria a nota de emitente com letra no CNPJ, que é produção desde
01/07/2026.

- **Arquivos:** `apps/frontend-transportada/src/modules/shared/nfeAccessKey.service.ts`,
  `apps/frontend-transportada/test/shared/nfe-access-key.contract.ts`
- **Aceite:** dígito cru, `p=` com e sem `|`, `chNFe=`, minúscula canonicalizada, CNPJ alfanumérico
  aceito, 43 e 45 caracteres recusados, texto qualquer devolve ausência.
- **Verificação:** `bun run --cwd apps/frontend-transportada test`

### T005 — `GET /nfe-documents` filtra por `accessKey`

Filtro na rota que já existe — ela já carrega `INVOICES_READ_POLICY`, o filtro de tenant e o
`serializeDocument` que a tela precisa. Estrito: `CHAVE_PATTERN`, caixa alta, 44 caracteres. Chave de
outra empresa devolve **lista vazia**, indistinguível de chave inexistente.

- **Arquivos:** `apps/api-transportada/src/nfe-documents/presentation/nfe-documents.routes.ts` e o
  `*.schema.ts` do módulo, `…/infrastructure/drizzle-*.repository.ts`,
  `apps/api-transportada/test/nfe-schema/tenant-safety.contract.ts`,
  `apps/api-transportada/test/nfe-documents/access-key-filter.contract.ts`
- **Aceite:** chave válida devolve a nota; chave de outro tenant devolve `[]`; chave malformada
  devolve `400`; o `tenant-safety` cobre a query nova (obrigatório em qualquer mudança de query).
- **Verificação:** `bun run --cwd apps/api-transportada test` · `bun run typecheck`

### T006 — O cliente HTTP do frontend consulta por chave

Uma função no client do módulo, com `AbortSignal` — o separador lê rápido, e leitura nova cancela a
consulta da anterior.

- **Arquivos:** `apps/frontend-transportada/src/modules/nfe-workspace/shared/*Client.service.ts` (ou
  o client do módulo consumidor), `…/queries/*.query.ts`, contrato correspondente
- **Aceite:** cancelamento não vira erro na tela; resposta fora do formato cai no
  `responseInvalid` que o módulo já tem.
- **Verificação:** `bun run --cwd apps/frontend-transportada test`

---

## Fase 4 — O leitor

> 🤖 Modelo: `sonnet` (T007 é 🧠 — dependência nova e ADR)

### T007 🧠 — Escolher o decodificador e registrar a ADR-0042

Critérios de **recusa**, todos verificáveis antes de instalar: WASM (forçaria `'wasm-unsafe-eval'` em
`script-src`, que vale para o bundle inteiro), worker criado a partir de `blob:` (`worker-src` é
`'self'` e não tem `blob:`), ausência de ESM, ausência de 1D Code-128 (a DANFE do modelo 55 costuma
imprimir Code-128C, não QR). §13 do `code-standart`: a mais moderna e ativamente mantida, conferindo
que o pacote existe e é o oficial.

- **Arquivos:** `docs/adr/0042-o-leitor-de-etiqueta-nao-afrouxa-a-csp.md`,
  `apps/frontend-transportada/package.json`, `bun.lock`
- **Aceite:** a ADR nomeia o pacote, a versão, os quatro critérios e as alternativas recusadas com o
  motivo; o `bun run build` emite a mesma CSP de antes, byte a byte.
- **Verificação:** `bun run --cwd apps/frontend-transportada build` · conferir
  `dist/content-security-policy.txt` inalterado

### T008 — O primitivo `@/components/ui/barcode-scanner`

`getUserMedia` com `facingMode: 'environment'`; `BarcodeDetector` quando existir (Chromium), o
decodificador de T007 num worker **empacotado pelo Vite** quando não (iOS, Firefox). Encerra toda
trilha de vídeo ao desmontar e ao fechar — câmera acesa atrás de diálogo fechado é a luz do celular
denunciando o bug. Botão só de ícone exige `aria-label`; o SVG vem de `@/components/ui/icon`, nunca
cru.

- **Arquivos:** `apps/frontend-transportada/src/components/ui/barcode-scanner.tsx`, o worker ao lado,
  `apps/frontend-transportada/test/design-system/barcode-scanner.contract.ts`,
  `docs/frontend/barcode-scanner.md`
- **Aceite:** ausência de `getUserMedia` e permissão negada devolvem indisponibilidade, não exceção;
  desmontar encerra as trilhas; o worker é referenciado por `new URL(…, import.meta.url)`, jamais por
  `blob:`.
- **Verificação:** `bun run --cwd apps/frontend-transportada test` · leitura manual em Android e em
  iPhone, registrada em `evidence.md`

### T009 — Sem câmera, o campo digitável continua

O diálogo de vínculo mantém o campo de chave de 44 caracteres, e o botão de leitura **não aparece**
quando a câmera é impossível — botão que não pode funcionar é pior que botão ausente.

- **Arquivos:** `apps/frontend-transportada/src/modules/trip/components/`, `…/locales/*.locale.json`
- **Aceite:** o campo aceita a chave impressa sob o código de barras e vincula pelo mesmo caminho;
  pt-BR acentuado (`test/shared/locale-accents.contract.ts`), e o `.en.` com as mesmas chaves.
- **Verificação:** `bun run --cwd apps/frontend-transportada test`

---

## Fase 5 — A tela cabe no polegar

> 🤖 Modelo: `sonnet` (T010 é 🧠 — a regra passa a valer para o produto inteiro)

### T010 🧠 — `docs/frontend/responsive.md` e o contrato que o cobra

Os quatro breakpoints do `web.md` §10 (base · 640px · 1024px · 1280px), a proibição de `max-width`, o
alvo de toque de 44px e a ausência de rolagem horizontal. O contrato varre `src/**/*.css` e falha em
`max-width` e em breakpoint fora dos quatro. **Sem lista de exceções** — contrato com allowlist nasce
sendo a documentação do que não se cumpre.

- **Arquivos:** `docs/frontend/responsive.md`,
  `apps/frontend-transportada/test/design-system/responsive.contract.ts`
- **Aceite:** o contrato falha com um `max-width` plantado e com um `min-width: 47.99rem` plantado.
- **Verificação:** `bun run --cwd apps/frontend-transportada test`

### T011 — Os sete `max-width` viram `min-width`

`billing/components/DueDateField.module.css:21`; `company-settings/styles/companySettings.module.css:748`;
`nfe-workspace/styles/nfeWorkspace.module.css:949, 960, 1430`; `styles/index.css:1058, 1156` — e os
nove breakpoints (40rem, 47.99rem, 48rem, 60rem, 64rem, 72rem, 80rem, 640px, 900px) colapsam nos
quatro. Inverter a consulta inverte a regra: cada uma se confere em 375px, 768px e 1280px antes de
fechar.

- **Arquivos:** os sete acima
- **Aceite:** o contrato de T010 passa sem exceção; nenhuma tela regride nas três larguras.
- **Verificação:** `bun run --cwd apps/frontend-transportada test` · conferência visual nas três
  larguras, registrada em `evidence.md`

### T012 — A tela de viagem nasce mobile-first

`trip.module.css` tem duas consultas, ambas de grade (linhas 82 e 88), e nunca foi pensada para
375px. O painel de criação (select de veículo, multi-select de motoristas), a tabela de notas e o
diálogo de vínculo passam a caber: diálogo em tela cheia no celular, tabela com `overflow-x-auto` no
seu próprio contêiner, alvo de toque de 44px em todo botão.

- **Arquivos:** `apps/frontend-transportada/src/modules/trip/styles/trip.module.css`,
  `…/components/TripCreationPanel.component.tsx`, `…/components/` do detalhe
- **Aceite:** sem rolagem horizontal do corpo em 375px; diálogo em tela cheia abaixo de 640px.
- **Verificação:** `bun run --cwd apps/frontend-transportada test` · conferência nas três larguras

---

## Fase 6 — O fluxo do separador

> 🤖 Modelo: `sonnet`

### T013 — Ler em sequência, com a recusa ao lado da nota

A câmera fica aberta entre leituras — confirmação por nota mata o ritmo de quem separa um palete. A
leitura que não carrega chave é descartada em silêncio (código de embalagem, QR de rastreio). Cada
nota lida vira linha, e a recusa (`documentAlreadyLinked`, `documentAlreadyDelivered`,
`documentNotFound`) aparece **na linha dela**, sem derrubar as vizinhas.

- **Arquivos:** `apps/frontend-transportada/src/modules/trip/hooks/`, `…/components/`,
  `…/locales/*.locale.json`, `apps/frontend-transportada/test/trip/scan-link.contract.ts`
- **Aceite:** leitura duplicada na mesma sessão não emite segunda chamada; recusa por nota não
  interrompe a sequência; o esqueleto de `@/components/ui/skeleton` cobre a resolução da chave.
- **Verificação:** `bun run --cwd apps/frontend-transportada test`

### T014 — A invalidação do vínculo passa pelo serviço único

Vincular nota é mexer num **vínculo**: o efeito é `nfeDocumentLink` de
`shared/mutationInvalidation.service.ts`, nunca uma lista de chaves montada à mão, e nenhum hook
importa a chave de consulta de outro módulo.

- **Arquivos:** `apps/frontend-transportada/src/modules/trip/hooks/`,
  `apps/frontend-transportada/test/shared/mutation-invalidation.contract.ts`
- **Aceite:** o contrato de invalidação cobre o caminho novo.
- **Verificação:** `bun run --cwd apps/frontend-transportada test`

### T015 — Fechar a feature

Atualizar o `CLAUDE.md` da raiz (regra inquebrável §14 do `code-standart`): o papel `separator`, a
permissão `trip.manage`, o `camera=(self)`, o filtro `accessKey` e o documento de responsividade.
Rodar a auditoria do §15 com a lista de `security.md` em mãos.

- **Arquivos:** `CLAUDE.md`, `docs/SECURITY.md`, `specs/055-…/evidence.md`
- **Aceite:** nenhum `[NEEDS CLARIFICATION]` aberto; a simbologia da etiqueta do cliente medida e
  registrada; `evidence.md` com uma linha por task.
- **Verificação:** `make check`
