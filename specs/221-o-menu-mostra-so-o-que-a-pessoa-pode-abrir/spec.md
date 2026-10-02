# Feature 221 — O menu mostra só o que a pessoa pode abrir

## Problema e resultado

O painel tem dezenove portas no menu e nenhuma delas pergunta quem está batendo.

`NAVIGATION_GROUPS.map` seguido de `group.items.map` (`main.tsx:654` e `:680`) renderiza a barra
lateral inteira para todo usuário autenticado, em cinco grupos — Fiscal (10 itens), Operações (2),
Cadastros (4), Usuários (2) e Administração (1). O único `permissions` do arquivo serve ao
redirecionamento do motorista (`:507`), nunca ao menu. Um **separador** — quem monta a viagem no
barracão, com `invoices.read`, `fleet.read`, `trip.read`, `trip.manage` e `cargo.measure` — vê, e
pode clicar, em CT-e, MDF-e, Faturamento, NFS-e, Operações, Empresa, Acessos, Papéis e grupos,
Perfis CT-e, Frete, Repasses, Ressarcimentos e Resultados. **Seis das dezenove portas são dele;
treze não.**

Isso foi relatado como defeito crítico de produção em 2026-10-01 ("os botões de CT-e não podem
aparecer para quem carrega"), e a investigação encontrou os gates de conteúdo todos corretos: a API
redige `freightAmount`/`nfeTotalValue` sem `trip.financials`
(`trip.routes.ts:TRIP_DOCUMENT_DETAIL_FIELD_POLICY`), os três botões de CT-e do detalhe da viagem
exigem `cte.submit`, e quinze páginas têm parede própria de permissão. **Não há vazamento de
dado** — o que existe é um produto que oferece catorze caminhos sem saída e deixa quem carrega
procurando onde é o trabalho dele. A conta do relato tinha dois papéis (`operator` + `separator`) e
as permissões somam, o que explicava os valores; o menu aberto explica o resto, e continua aberto
mesmo depois de a conta virar só `separator`.

E há um caso que não é "menu aberto demais", é **painel aberto para quem não é do painel**. A conta
de campo — `driver` e `aggregate`, cujo par de permissões é `trip.read` + `trip.report` — é levada
para o app do motorista só quando abre `/minha-viagem` ou a raiz: `resolveDriverAppRedirect`
(`driverAppRedirect.service.ts:33`) calcula `isDriverEntry` com esses dois caminhos e devolve `stay`
para todos os outros. Um motorista que digite, cole ou tenha no histórico `/trips`, `/cte-batches` ou
`/billing` **entra no painel do escritório**, com a barra inteira de dezenove itens. Ele não lê nada
(nenhuma entrada do mapa da RF-A3 abre com `trip.read` ou `trip.report`, e as paredes respondem),
mas está dentro de uma ferramenta que não é dele, num aparelho de rua, muitas vezes compartilhado.

A parede não é desenho, é sedimento. Quinze páginas a implementaram uma por uma — `CteBatchWorkspace`
calcula `isForbidden` e imprime `t('forbidden')`, `FreightWorkspace` imprime "Sem acesso",
`UserAdministration` tem `users.forbidden` — e ninguém voltou ao menu que levou a pessoa até lá.
**Três** entradas do menu nem parede têm: **Empresa** mostra abas vazias com um aviso de "somente
leitura" que não lê nada (as consultas são desabilitadas), **NFS-e** renderiza e deixa a consulta
responder 403, e **Repasses** não tem checagem alguma — nem no render, nem na consulta —, então quem
abre a tela lê as cobranças da empresa. Essa última é exposição, não só porta sem saída. O repositório já tem a preferência oposta
escrita, da spec 156 D11, em dois comentários do próprio detalhe da viagem: _"sem ela, oculta em vez
de bater 403"_.

Falta também o mapa. Nenhum lugar do código diz qual permissão abre qual workspace — cada página
sabe sozinha, e `'billing.read'` é declarada como constante local em **cinco** arquivos diferentes
do módulo de faturamento. Filtrar o menu sem declarar esse mapa uma vez criaria uma segunda verdade
que divergiria calada, que é exatamente o modo de falha que esta base já pagou em outros lugares.

**Resultado esperado.** Conta de campo não abre o painel por caminho nenhum. Para o resto, o menu
mostra só os itens que a pessoa pode abrir, e um grupo sem nenhum item sobrando não aparece. A permissão de cada workspace vive declarada num lugar só, com o
compilador cobrando entrada para toda porta nova. Quem entra sem destino escolhido aterrissa no
primeiro workspace que pode abrir, não numa parede. E as paredes das páginas continuam todas de pé,
porque esconder o caminho não é autorizar — a autorização continua sendo da API.

## Fora do escopo

- **Mudar quem pode o quê.** Nenhuma permissão de papel muda; `COMPANY_ROLE_PERMISSIONS`
  (`api-transportada/src/identity/domain/authorization.policy.ts`) não é tocada. Esta spec só deixa
  de oferecer o que já era proibido.
- **Tirar as paredes das páginas.** Elas são defesa em profundidade e ficam: URL direta, link
  colado, favorito antigo e permissão revogada no meio da sessão continuam caindo nelas. Esta spec
  acrescenta parede às três que não têm (Empresa, NFS-e e Repasses), nunca remove.
- **Apertar a leitura de `GET /delivery-charges` na API.** Ela é `trip.read` e não recorta pelo vínculo
  — achado registrado em `docs/SECURITY.md:383` desde 2026-09-18. Esta spec fecha a porta da **tela**
  (RF-D3); apertar a rota mexe no que motorista e agregado alcançam por API e é spec própria.
- **Unificar as constantes de permissão espalhadas pelas páginas.** O mapa novo serve ao menu e à
  aterrissagem. Fazer as quinze páginas lerem dele é refatoração de alcance próprio, com risco
  próprio, e vira spec só se der problema — o contrato da RF-A3 segura a divergência enquanto isso.
- **Filtrar menu por estado da viagem, da empresa ou do ambiente.** O critério é permissão, e só.
- **O app do motorista e o portal da contratante.** `frontend-driver` não tem menu, e
  `frontend-client` tem navegação própria com um papel só (`contractor`). Esta spec muda **quando** o
  painel manda a conta de campo para o app do motorista, nunca o que o app faz com ela.
- **Desfazer a transição da ADR-0075 §6.** Com `VITE_DRIVER_APP_URL` ausente, o painel continua
  servindo `/minha-viagem`, e a fila antiga (IndexedDB desta origem) continua tendo precedência sobre
  qualquer redirecionamento — `pending-screen` e `install-screen` são intocados, e o beacon
  `driver_legacy_served` continua medindo o que media (spec 189 Fase 10).
- **Esconder ação dentro de tela já aberta.** Botão com permissão errada é defeito individual, e
  cada um se corrige onde está — como o "Emitir MDF-e" corrigido em 2026-10-01 (`mdfe.manage`, não
  `trip.manage`).

## Histórias priorizadas

### P1 — Quem carrega vê o trabalho dele

Como **separador**, quero abrir o painel e ver no menu só NF-e, Viagens, Ocorrências, Frota e
Pendências, para não precisar descobrir por tentativa e erro quais das dezenove entradas respondem
"sem acesso".

### P2 — A porta nova não nasce aberta

Como **pessoa que acrescenta um workspace**, quero que o compilador me obrigue a declarar qual
permissão o abre, para não repetir o defeito desta spec no próximo item do menu.

### P3 — Entrar não começa por uma parede

Como **usuário de qualquer papel**, quero que abrir o painel sem endereço escolhido me leve a uma
tela que eu posso usar, e não ao NF-e fixo que talvez eu não possa ler.

### P4 — O grupo vazio não ocupa linha

Como **separador**, quero que os grupos Usuários e Administração não apareçam quando nenhum item
deles é meu, porque grupo que abre vazio é pior que grupo ausente.

### P5 — O motorista não cai no painel

Como **transportadora**, quero que a conta de campo vá para o app do motorista por qualquer caminho
que ela abra, para que um link antigo no histórico do celular não ponha o escritório na mão de quem
está na rua.

### P6 — O separador começa na viagem

Como **separador**, quero abrir o painel já na listagem de viagens, porque é dali que meu dia começa
— e, se eu também for motorista, quero continuar alcançando a minha viagem pelo menu.

## Requisitos funcionais

### A. O mapa de permissão por workspace

- **RF-A1.** Um módulo novo declara, para cada chave de `WORKSPACE_NAVIGATION_ITEMS`, a permissão
  (ou o conjunto "qualquer uma de") que abre aquele workspace. A estrutura é
  `Record<WorkspaceKey, readonly TransportadaPermission[]>` com `satisfies`, de modo que chave nova
  sem entrada **reprova `bun run typecheck`** antes de qualquer teste rodar.
- **RF-A2.** Lista "qualquer uma de" significa união: basta uma permissão do conjunto. Viagens
  (`fleet.read` ou `trip.report-on-behalf`) e CT-e (`cte.manage` ou `cte.submit`) são os dois casos
  que já existem; nenhum workspace exige duas permissões ao mesmo tempo hoje, e o formato não
  oferece essa forma — exigência conjunta entra quando houver um caso real, não antes.
- **RF-A3.** O mapa é **transcrito** da condição que cada página já aplica, com o arquivo e a linha
  de origem anotados ao lado de cada entrada, no molde de `state-gates.contract.ts` (que transcreve
  a máquina de estados do backend). O valor verificado em 2026-10-01 é:

  | Item do menu    | Chave              | Abre com                                | Origem verificada                                           |
  | --------------- | ------------------ | --------------------------------------- | ----------------------------------------------------------- |
  | NF-e            | `nfe`              | `invoices.read`                         | `nfeWorkspaceViewModel.service.ts:28`                       |
  | Frete           | `freight`          | `settings.manage`                       | `freightViewModel.service.ts:38`                            |
  | CT-e            | `cte-batch`        | `cte.manage` ou `cte.submit`            | `CteBatchWorkspace.page.tsx:75`                             |
  | Viagens         | `trip`             | `fleet.read` ou `trip.report-on-behalf` | `canReadTrip` (`trip.constant.ts`)                          |
  | MDF-e           | `mdfe-manifest`    | `mdfe.read`                             | `useMdfeManifests.hook.ts:63`                               |
  | Faturamento     | `billing`          | `billing.read`                          | `billingViewModel.service.ts:25`                            |
  | NFS-e           | `nfse-invoice`     | `nfse.read` ou `settings.manage`        | ✔ `NfseInvoiceWorkspace.page.tsx:64-66` — duas abas        |
  | Operações       | `operations`       | `operations.read`                       | `operationsViewModel.service.ts:10`                         |
  | Ocorrências     | `trip-occurrences` | `fleet.read`                            | CLAUDE.md § "a tela de `/ocorrencias` … em fleet.read"      |
  | Empresa         | `company-settings` | `settings.manage`                       | ✔ `company-settings.routes.ts:22` — o GET exige            |
  | Acessos         | `users`            | `users.manage`                          | `companyUsers.constant.ts:4`                                |
  | Papéis e grupos | `access-profiles`  | `groups.manage`                         | `companyUsers.constant.ts:8`                                |
  | Perfis CT-e     | `cte-profiles`     | `settings.manage`                       | `cteProfiles.constant.ts:3`                                 |
  | Frota           | `fleet`            | `fleet.read`                            | `useFleet.hook.ts`                                          |
  | Pendências      | `pendencias`       | `fleet.read`                            | `usePendingItems.hook.ts:17`                                |
  | Clientes        | `delivery-clients` | `fleet.read`                            | ✔ `delivery-client.routes.ts:38` — `fleet.manage` é edição |
  | Repasses        | `extra-charges`    | `billing.create` ou `trip.financials`   | ⚠️ intenção — a API lê com `trip.read` (nota abaixo)        |
  | Ressarcimentos  | `reimbursements`   | `trip.financials`                       | `useOccurrenceReimbursements.hook.ts:20`                    |
  | Resultados      | `trip-financials`  | `trip.financials`                       | `FinancialResultsWorkspace.page.tsx:27`                     |
  | Minha viagem    | `driver-trip`      | `trip.report`                           | entrada nova no menu (RF-E6)                                |

  ⚠️ **A primeira task reconfere cada linha contra o código antes de escrever o mapa.** A tabela é
  ponto de partida medido, não verdade transcrita de memória. As duas entradas que estavam em aberto
  foram conferidas em 2026-10-01, e o resultado está em D3 e D4 — uma confirmou a suposição, a outra
  **não**.

  ⚠️ **Repasses é o caso em que o mapa escolhe a intenção contra o que a API permite.** A leitura de
  `GET /delivery-charges` é `trip.read` (`delivery-charge.routes.ts:40`, `CHARGE_READ_POLICY`), a
  página `ExtraChargeWorkspace.page.tsx` **não tem parede nenhuma**, e a consulta da lista não tem
  `enabled` — então hoje o separador abre `/repasses` e lê as cobranças da empresa. A permissividade
  dessa rota é achado **já registrado** em `docs/SECURITY.md:383` (2026-09-18, "não recorta pelo
  vínculo do motorista", pré-existente). O mapa usa `trip.manage`/`billing.create` porque é a intenção
  do produto para uma tela de dinheiro; apertar a rota da API é correção própria, fora desta spec, e a
  RF-D3 fecha a porta da tela enquanto isso.

- **RF-A4.** `notification` fica fora do mapa de menu: ela não aparece em grupo (`main.tsx:137`), a
  porta dela é o sino do cabeçalho, e a entrada existe só para o título da tela sair certo.
  `driver-trip` **entra** no mapa, com `trip.report`, porque a RF-E6 a traz para o menu — o comentário
  de `main.tsx:134` ("quem é do campo não navega por menu") descrevia o motorista puro, e deixa de
  valer para quem é motorista e separador. O tipo do mapa cobre todas as chaves que os grupos usam.

### B. O menu filtra

- **RF-B1.** Um item só é renderizado quando o usuário tem ao menos uma das permissões do mapa.
- **RF-B2.** Um grupo sem nenhum item visível não é renderizado — nem o cabeçalho, nem o ícone, nem
  a seta de abrir.
- **RF-B3.** Enquanto as permissões não chegaram (`authMeQuery` carregando), o menu **não pisca**:
  ele mostra o esqueleto da barra, nunca a lista inteira seguida da lista cortada. Lista completa
  antes da resposta é o defeito desta spec acontecendo por meio segundo.
- **RF-B4.** Falha ao ler as permissões (`authMeQuery.isError`) é tratada como "nenhuma permissão
  conhecida": o menu fica só com o que não exige permissão nenhuma, e o aviso de erro que o
  cabeçalho já mostra continua sendo a explicação. Errar para o lado de esconder é reversível por um
  recarregamento; errar para o lado de mostrar devolve o defeito.

### C. A aterrissagem respeita a permissão

- **RF-C1.** `resolveCurrentWorkspace()` continua decidindo por URL e por `sessionStorage` **sem**
  consultar permissão: ela é síncrona e roda antes de `authMeQuery` responder. O filtro de aterrissagem
  é um segundo passo, depois das permissões, no molde do redirecionamento do motorista.
- **RF-C1b.** A decisão de aterrissagem precisa saber **de onde** veio o workspace, e são três origens
  com tratamentos diferentes: `path` (a pessoa pediu aquele endereço — nunca se redireciona, RF-C4),
  `stored` (a última tela da sessão — respeitada se a conta puder abri-la) e `default` (não havia
  endereço nenhum, e hoje isso cai no `nfe` fixo). Por isso `resolveCurrentWorkspace` passa a devolver
  a origem junto da chave; sem ela, "URL digitada" e "aterrissagem sem endereço" são indistinguíveis, e
  qualquer regra acerta uma às custas da outra.
- **RF-C2.** Resolvido o workspace e conhecidas as permissões, se o escolhido não é aberto por
  nenhuma delas, o painel navega para a **aterrissagem preferida** da conta (RF-C6) e, na falta de
  preferência, para o **primeiro item visível do menu** na ordem de `WORKSPACE_NAVIGATION_ITEMS`. O
  `nfe` fixo de hoje (`main.tsx:279`) deixa de ser o destino universal — ele exige `invoices.read`,
  que quatro papéis não têm.
- **RF-C6.** **O separador aterrissa em Viagens.** Conta cujo papel inclui `separator` e **nenhum**
  papel de escritório (`company-admin`, `operator`, `finance`, `fiscal`) tem `trip` como aterrissagem
  preferida: o trabalho dela começa na listagem de viagens, não na fila de NF-e, que é o primeiro item
  do menu e seria o destino pela regra geral. A preferência só vale quando o workspace resolvido não é
  aberto pela conta — quem salvou outra tela no `sessionStorage` e pode abri-la continua voltando para
  ela (RF-C1).
- **RF-C7.** A preferência da RF-C6 é lida de `roles`, que `GET /auth/me` já devolve validado
  (`useAuthMe.query.ts:153`). É a **única** leitura de papel desta spec, e ela decide _onde começar_,
  nunca _o que pode abrir_ — acesso continua por permissão (D8). Preferência cujo workspace a conta
  não pode abrir é ignorada, e a regra geral assume.
- **RF-C3.** A troca de aterrissagem é `replace`, nunca `push`: o usuário não deve voltar para a
  tela proibida com o botão "voltar" do navegador.
- **RF-C4.** URL digitada ou link colado para workspace proibido **não** é redirecionado — a pessoa
  pediu aquele endereço, e a parede da página responde (é ela que diz "sem acesso", em vez de uma
  navegação silenciosa que parece bug). O redirecionamento da RF-C2 vale só para a aterrissagem sem
  endereço escolhido: `sessionStorage` e a raiz.
- **RF-C5.** Usuário sem nenhum workspace visível vê uma tela dedicada dizendo que a conta não tem
  acesso a nenhuma área do painel e a quem pedir, com o botão de sair. Hoje ele cairia no NF-e
  emparedado, sem nem um caminho para o logout no corpo da tela.

### D. As paredes continuam, e ganham duas

- **RF-D1.** Nenhuma parede de página é removida.
- **RF-D2.** **Empresa** (`company-settings`) e **NFS-e** (`nfse-invoice`) ganham a parede que não
  têm, no molde das outras quinze: sem a permissão, a frase de "sem acesso". ⚠️ Em Empresa as consultas
  **já** são desabilitadas sem `settings.manage` (`useCompanySettings.hook.ts:144`, `:175`) — a tela
  hoje não bate 403, ela mostra abas vazias com um aviso de "somente leitura" que não lê nada. A parede
  troca uma casca vazia por uma frase honesta.
- **RF-D3.** **Repasses** (`extra-charges`) ganha parede, e esta é a que fecha exposição de verdade:
  `ExtraChargeWorkspace.page.tsx` não tem checagem nenhuma e a consulta da lista não tem `enabled`,
  então quem abre a tela vê as cobranças da empresa — o separador inclusive. A parede usa a mesma regra
  do mapa (`billing.create` ou `trip.financials`, D4) — **a mesma função**, não uma cópia da condição:
  parede que decide por conta própria é a 16ª constante espalhada, e foi uma delas que produziu o erro
  da D4. O achado da rota continua registrado em
  `docs/SECURITY.md:383` para a correção da API, que é outra spec.

### E. A conta de campo não abre o painel

- **RF-E1.** `isDriverEntry` deixa de ser "dois caminhos" e passa a ser "**qualquer** caminho, quando
  a conta é de campo": `pathname === '/minha-viagem'` **ou** `isFieldOnlyUser`. A definição de conta
  de campo não muda — `isFieldOnlyUser` continua sendo `trip.report` **sem** `trip.manage`
  (`driverWorkspace.service.ts:10`), que é por permissão e não por papel, e que deixa o separador de
  fora de propósito.
- **RF-E2.** A precedência interna de `resolveDriverAppRedirect` **não muda**: fila antiga com itens
  (`pending-screen`) vem antes de tudo, depois ícone antigo instalado (`install-screen`), depois
  `redirect`. O que muda é só quantos caminhos entram na decisão.
- **RF-E3.** Sem o interruptor (`VITE_DRIVER_APP_URL` ausente), o painel continua sendo a casa do
  motorista — mas a casa é `/minha-viagem`, não o painel inteiro. Um modo novo, `legacy-home`, leva a
  conta de campo de qualquer outro caminho para `/minha-viagem` por navegação interna
  (`history.replaceState`, mesma origem). Hoje esse caso devolve `stay` e entrega o escritório.
- **RF-E4.** A conta de campo nunca vê a barra de navegação do painel, em caminho nenhum — nem no
  instante entre a leitura das permissões e o redirecionamento (é o mesmo requisito da RF-B3, com
  consequência maior: aqui o que pisca é o painel inteiro).
- **RF-E5.** Conta de campo **não** cai na tela de conta sem acesso da RF-C5: ela tem onde trabalhar,
  e dizer "sua conta não tem acesso" a um motorista é mentira. A decisão do motorista roda antes, e a
  RF-C5 só alcança quem não é de campo e não abre nenhum workspace.
- **RF-E6.** **O motorista que também é separador fica no painel — e ganha a porta da viagem dele.**
  A conta com os dois papéis tem `trip.report` (campo) e `trip.manage` (barracão), então
  `isFieldOnlyUser` é `false` e ela **não** é redirecionada: ela monta viagem no painel e aterrissa em
  Viagens pela RF-C6. Mas hoje ela não tem como chegar na própria viagem: "Minha viagem" está **fora**
  dos grupos do menu de propósito (`main.tsx:134`, "quem é do campo não navega por menu"), e essa
  premissa deixa de valer para quem é das duas coisas. Então o item **passa a aparecer no menu para
  quem tem `trip.report`** — e só para esses, então o separador puro continua com os itens da CA01, sem
  "Minha viagem". Com o interruptor ligado ele leva ao app do motorista (`/minha-viagem` é entrada de
  motorista, e a precedência da RF-E2 continua valendo); desligado, à tela antiga que o painel serve.

## Requisitos não funcionais

- **Esconder não é autorizar.** A API continua a única autoridade; nenhuma checagem desta spec
  substitui política de rota (`security.md` §2 — autorização por objeto, no servidor).
- **Sem requisição nova.** O mapa consome `authMeQuery`, que o painel já carrega para o cabeçalho e
  para cada workspace.
- **Sem dependência nova** e sem migration: a mudança é de render e de uma função pura.
- **i18n.** Toda frase nova em `*.locale.json`, pt-BR **acentuado** (`locale-accents.contract.ts`).
- **Acessibilidade.** Grupo escondido sai do DOM, não fica `display: none` com foco alcançável por
  teclado.

## Casos extremos e falhas

| Situação                                                     | Comportamento esperado                                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Permissões ainda carregando                                  | Esqueleto da barra; nunca a lista completa (RF-B3)                               |
| `authMeQuery` falhou                                         | Menu mínimo, aviso do cabeçalho explica (RF-B4)                                  |
| Permissão revogada enquanto a sessão está aberta             | O item desaparece no próximo `authMeQuery`; a tela aberta cai na parede dela     |
| URL direta para workspace proibido                           | Parede da página, sem redirecionar (RF-C4)                                       |
| `sessionStorage` com workspace que a pessoa perdeu           | Aterrissa no primeiro visível, com `replace` (RF-C2/C3)                          |
| Papel sem nenhum workspace                                   | Tela dedicada de conta sem acesso, com sair (RF-C5)                              |
| `automation` (papel de serviço) autenticando no painel       | Cai na RF-C5; token de máquina não tem por que abrir painel, e não quebra a tela |
| Conta de campo em `/trips` com o app configurado             | Vai para o app do motorista (`redirect`), não para o painel (RF-E1)              |
| Conta de campo em `/trips` sem o app configurado             | `legacy-home`: `replaceState` para `/minha-viagem` (RF-E3)                       |
| Conta de campo com fila antiga pendente, em qualquer caminho | `pending-screen` — a fila vem antes do redirecionamento (RF-E2)                  |
| Motorista que é separador (`driver` + `separator`)           | Fica no painel, aterrissa em Viagens, e o menu mostra "Minha viagem" (RF-E6)     |
| `separator` + `operator`                                     | Regra geral de aterrissagem; a preferência do separador não se aplica (CA15)     |
| Preferência aponta para workspace que a conta não abre       | Preferência ignorada, regra geral assume (RF-C7)                                 |
| Workspace novo sem entrada no mapa                           | `bun run typecheck` reprova (RF-A1)                                              |

## Critérios de aceite

1. **CA01.** Dado o conjunto de permissões do `separator` transcrito de `authorization.policy.ts`
   (`invoices.read`, `fleet.read`, `trip.read`, `trip.manage`, `cargo.measure`), o menu tem
   exatamente seis itens — NF-e, Viagens (Fiscal), Ocorrências (Operações), Frota, Pendências e
   Clientes (Cadastros) — e três grupos; **Usuários** e **Administração** não são renderizados.
2. **CA02.** Com as permissões do `company-admin`, nenhum item desaparece em relação a hoje.
3. **CA03.** Com as permissões do `fiscal`, o grupo Usuários não aparece, e CT-e, MDF-e e NFS-e
   aparecem.
4. **CA04.** Grupo cujos itens todos caíram não é renderizado (CA01 serve de caso, afirmado por
   contrato próprio).
5. **CA05.** Acrescentar uma chave em `WORKSPACE_NAVIGATION_ITEMS` sem entrada no mapa reprova
   `bun run typecheck` — provado por mutação na evidência, não por leitura.
6. **CA06.** `sessionStorage` apontando para `billing` com permissões de `separator` aterrissa em
   **Viagens** — a preferência da CA14 vence o "primeiro item visível", que daria NF-e —, com
   `history.replaceState`, e o botão "voltar" não devolve o faturamento. `sessionStorage` apontando
   para uma tela que a conta **pode** abrir é respeitado, sem troca (RF-C1).
7. **CA07.** URL `/billing` digitada com permissões de `separator` **permanece** em `/billing` e
   mostra a parede do faturamento.
8. **CA08.** Conjunto de permissões vazio mostra a tela de conta sem acesso, com o botão de sair.
9. **CA09.** `/company-settings`, `/nfse-invoices` e `/repasses` sem a permissão mostram a frase de sem
   acesso, e nenhuma consulta dos três módulos é disparada. Em `/repasses` com permissões de
   `separator` isso é regressão de exposição: hoje a lista de cobranças carrega.
10. **CA10.** Com as permissões de `driver` (`trip.read`, `trip.report`) e o app configurado,
    `resolveDriverAppRedirect` devolve `redirect` para `/trips`, `/cte-batches`, `/billing` e a raiz —
    hoje devolve `stay` para os três primeiros.
11. **CA11.** Mesmas permissões **sem** `VITE_DRIVER_APP_URL`: `/trips` devolve `legacy-home`, e
    `/minha-viagem` continua `stay`.
12. **CA12.** Conta de campo com `pendingTotal > 0` devolve `pending-screen` em qualquer caminho — a
    fila antiga não é perdida por causa desta spec, e o beacon continua disparando só nesse modo.
13. **CA13.** Permissões de `separator` (tem `trip.manage`) **não** são conta de campo: `/trips`
    devolve `stay` e o painel abre com o menu filtrado da CA01.
14. **CA14.** Conta com papel `separator` e nenhum papel de escritório, entrando sem endereço
    escolhido, aterrissa em **Viagens** (`/trips`) — não em NF-e, que é o primeiro item do menu.
15. **CA15.** Conta com `separator` **e** `operator` aterrissa pela regra geral (primeiro item
    visível), não pela preferência do separador.
16. **CA16.** Conta com papéis `driver` **e** `separator`: `isFieldOnlyUser` é `false`, não é
    redirecionada em caminho nenhum, aterrissa em Viagens, e o menu **mostra "Minha viagem"**.
17. **CA17.** Conta `separator` pura **não** mostra "Minha viagem" no menu — ela continua com os cinco
    itens da CA01.
18. **CA18.** Preferência cujo workspace a conta não pode abrir é ignorada e a regra geral assume
    (prova direta da RF-C7, com um conjunto de permissões sem `fleet.read`).
19. **CA19.** Revisão de design (`web.md` §15): barra comparada com ela mesma antes e depois, nos
    estados recolhido e expandido, em 375 px e 1280 px, com **print ao usuário**.

## Decisões

- **D1 — Esconder, não desabilitar.** Item desabilitado anuncia a existência de uma área e não
  explica por que ela não abre, e a barra tem ~14 linhas de espaço para 19 itens — desabilitado
  gasta a linha sem entregar nada. Precedente escrito na spec 156 D11: _"sem ela, oculta em vez de
  bater 403"_.
- **D2 — O mapa é transcrição, não refatoração.** As páginas continuam com as constantes delas
  (fora do escopo). O risco de divergência é real e fica coberto pelo contrato da RF-A3, que
  transcreve origem e linha; é o mesmo arranjo que `state-gates.contract.ts` mantém com a máquina de
  estados do backend desde a spec 079.
- **D3 — Empresa abre com `settings.manage`. ✔ Conferido em 2026-10-01.** O `GET /company-settings` da
  API exige `settings.manage` (`company-settings.routes.ts:22`), e o painel já desabilita as consultas
  sem ela. Nenhum painel da aba abre com permissão diferente. A suposição estava certa.
- **D4 — Repasses abre com `billing.create` ou `trip.financials`. ✔ Conferido em 2026-10-01,
  **corrigido duas vezes**.** Três camadas de erro, e vale registrar todas porque cada uma ensina algo
  diferente:
  1. A suposição inicial (`trip.manage` ou `billing.create`) tratava como permissão de leitura o que é
     permissão de **ação**: em `useExtraCharges.hook.ts:97-98` as duas governam `canCloseBatch` e
     `canConfirm`. A leitura da lista não é governada por nada no cliente.
  2. A permissão que a API exige para ler é `trip.read` (`delivery-charge.routes.ts:40`) — mais larga
     do que o produto quer para uma tela de dinheiro, e já registrada como achado em
     `docs/SECURITY.md:383`. Transcrevê-la poria a tela no menu do separador e do motorista,
     **ampliando** o achado. Por isso esta entrada é a única do mapa que é intenção, não transcrição.
  3. A intenção, como escrita primeiro, **não cumpria a própria intenção**: o separador tem
     `trip.manage`, então `trip.manage` ou `billing.create` o deixava entrar — contradizendo a CA01 e a
     RF-D3, que existem para barrá-lo. A regra correta é a permissão de **dinheiro**:
     `billing.create` ou `trip.financials`. Quem abre: `company-admin` e `finance` (têm as duas) e
     `operator` (tem `trip.financials`); ficam fora `separator`, `fiscal`, `viewer`, `driver` e
     `aggregate`.

  A lição que fica: "escolher a intenção" é mais arriscado que transcrever, porque não há código
  conferindo — a intenção tem de ser verificada contra `COMPANY_ROLE_PERMISSIONS` papel por papel, e
  foi assim que o erro apareceu.

- **D5 — A aterrissagem tem uma preferência por papel, não uma configuração por usuário.** A ordem de
  `WORKSPACE_NAVIGATION_ITEMS` resolve a maioria dos casos, mas não o separador: a fila de NF-e é o
  primeiro item do menu e não é onde o barracão começa o dia (RF-C6). A preferência é uma lista curta
  no código, avaliada em ordem. Guardar "a tela inicial **de cada usuário**" continua fora — isso é
  configuração, e configuração é spec própria.
- **D11 — Clientes abre com `fleet.read`, e o separador o vê. ✔ Decidido pelo usuário em
  2026-10-01.** A primeira versão usou `fleet.manage` e tirava a tela de `fiscal` e `viewer`, que a
  abrem em leitura — e o único motivo era fazer o menu do separador fechar em cinco itens, que é
  argumento de teste, não de produto. O usuário confirmou que esses papéis podem ver Clientes, então
  o mapa segue a permissão real da rota (`delivery-client.routes.ts:38`), `fleet.manage` fica como o
  que sempre foi (edição), e o separador ganha o item junto. A CA01 passou a afirmar seis.
- **D6 — Errar escondendo.** Nos dois estados de incerteza (carregando, erro de leitura) o menu
  mostra menos, nunca mais. É a direção reversível.
- **D7 — O motorista é levado, não barrado.** Conta de campo poderia receber a tela de sem acesso,
  que é menos código. Mas ela tem onde trabalhar, e o produto sabe onde: a correção é mandá-la para
  lá (app próprio, ou `/minha-viagem` enquanto o interruptor estiver desligado), nunca recusar. Barrar
  um motorista que abriu um link antigo transformaria um erro de endereço em suporte.
- **D8 — A regra é por permissão, não por papel.** `isFieldOnlyUser` continua lendo
  `trip.report` sem `trip.manage`. Papel novo de campo entra sozinho, e a conta que acumula campo com
  barracão continua no painel — que é a consequência correta de as permissões somarem, lição do
  incidente de 2026-10-01.
- **D9 — Acesso por permissão; aterrissagem pode ler papel.** São perguntas diferentes: "o que esta
  conta pode abrir" é soma de permissões, e é o que a D8 governa; "onde esta pessoa começa o dia" é
  quem ela é na operação, e `separator` é exatamente essa informação. A leitura de `roles` é uma, fica
  no decididor de aterrissagem, e nunca entra em `canOpenWorkspace`. Um contrato afirma isso: o módulo
  do mapa não importa `CompanyRole`.
- **D10 — Motorista-separador é caso real, e fica no painel.** A conta existe na operação (o usuário
  confirmou em 2026-10-01), e as duas metades dela são verdadeiras: ela monta viagem e também dirige.
  Nenhuma pode ganhar da outra — daí ficar no painel (porque tem `trip.manage`) **e** ganhar a porta
  para o app do motorista no menu (RF-E6). Tratá-la como conta de campo tiraria dela o barracão;
  tratá-la só como barracão esconderia a viagem dela.

## Dúvidas

Nenhuma aberta. D3 e D4 são decisões tomadas com a checagem embutida na primeira task — se a
checagem contrariar a decisão, a task registra em `evidence.md` e segue o que o código mostrar, sem
parar a fase.
