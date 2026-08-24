# 053 — A landing genérica e o pré-cadastro do agregado

## Problema e resultado

A transportadora capta agregado por telefone e WhatsApp. Quem chega não tem onde se apresentar, e
quem atende transcreve CPF, RNTRC e placa numa planilha antes de digitar tudo de novo no painel. Não
existe página pública da instalação, e não existe caminho do interessado até a frota.

A spec 049 já resolveu a metade de dentro: cadastrar motorista com perfil `aggregate` cria o usuário
junto, pelo convite. Falta a metade de fora — o interessado que ainda não é motorista de ninguém.

**Resultado:** um site público **genérico, configurado pelo painel**, com um formulário de
pré-cadastro que grava uma **candidatura**. Nada toca identidade enquanto um operador não aprovar;
aprovar reusa `POST /fleet/drivers`, que já sabe criar motorista e usuário. Quem compra o produto
liga a landing preenchendo um formulário, não editando código nem refazendo build.

## Auditoria do SDK — o que ele atende e o que não atende

A decisão foi adotar `@adatechnology/user-module` + `@adatechnology/user-contracts` +
`@adatechnology/user-ui`. A leitura do código dos três está abaixo, porque metade do que se espera
deles não existe e descobrir isso na implementação custaria a fase inteira.

### Atende

| Necessidade                                                            | Onde                                                       |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| Conta local com senha (hash por `Bun.password`)                        | `CreateUserUseCase`, `AuthenticateLocalUseCase`            |
| Sessão com access token + refresh rotativo em cookie                   | `TokenService`, `RefreshSessionUseCase`, `http/cookies.ts` |
| Recuperação de senha que não enumera usuário (202 invariável)          | `RequestPasswordResetUseCase`, `authRoutes.ts`             |
| Perfil, troca de senha, listagem de usuários                           | `UpdateProfile`, `GetProfile`, `ListUsers`                 |
| Rotas declarativas com `scope: 'public'` e OpenAPI gerado              | `createUserRoutes`, `@adatechnology/module-http/openapi`   |
| Adaptador WHATWG que casa com `Bun.serve`                              | `@adatechnology/user-module/http/fetch`                    |
| Multiempresa por `companyId`, com unique parcial e teste de isolamento | `schema/schema.ts`, `repositories/isolation.test.ts`       |
| Ganchos de evento (`onUserCreated`) para o host reagir                 | `UserHooks`, `USER_EVENT`                                  |

### Não atende — e é o que a spec resolve por fora

1. **Pré-cadastro não existe no SDK.** `createUserSchema` exige `email`, `name`, `password` e `role`:
   é criação de conta pronta, não candidatura. Não há estado `pending`, não há fila de aprovação e
   não há campo de RNTRC, veículo ou região. A entidade `aggregate_applications` é nossa.

2. **`user-ui` não é customizável em design.** Nenhum componente exporta `className`, `classNames`,
   slot ou token — a única prop de personalização é `labels`. O estilo são strings literais de
   Tailwind embutidas no `.tsx` (`bg-brand-600`, `border-gray-300`, `focus:ring-brand-500`), e
   `frontend-transportada` **não usa Tailwind**. Renderizar `SignInForm` ou `UserWorkspace` na nossa
   landing entregaria formulário sem estilo nenhum, e estilizá-lo por fora seria UI paralela ao
   design system — proibido sem ADR por `web.md` §8/§9.

   **Consequência:** do `user-ui` aproveitamos **só a camada headless** — `UserProvider`, `useSignIn`,
   `usePasswordReset`, `useProfile` e os tipos de `providers/types.ts`, que não têm marcação. Os
   componentes renderizados ficam de fora, e a landing desenha os campos com os nossos tokens.

3. **O schema do SDK colide com o `identity` da API.** `user-module` traz `pgSchema('user')` com
   `users`, `password_reset_tokens` e `refresh_tokens`, mais migrations próprias
   (`runUserMigrations`, tabela de controle separada). A `api-transportada` já tem
   `user_company_memberships`, `user_invitations`, `password_resets` e papel em CHECK. Rodar os dois
   no mesmo banco é ter **dois depósitos de usuário** discordando de quem existe.

4. **A sessão do SDK não é a do painel.** O painel autentica por Bearer do Keycloak (JWKS); o SDK
   emite JWT próprio assinado por `accessToken.secret`. São dois mundos de sessão.

5. **`role` é `varchar(40)` livre**, sem catálogo — `aggregate` vive em CHECK nosso. Paridade manual.

6. **`companyId` é `varchar(64)` anulável**, sem FK para `companies`. O SDK não conhece nossa empresa.

7. **Rate limit não vem no pacote**, e esta API não tem limitador. Rota pública nova entra com o
   mesmo achado já datado em `docs/SECURITY.md`.

## Decisões

### A landing é genérica, e a configuração é dado

Nenhum literal de transportadora em `src/`. Nome fantasia, razão social, CNPJ, contatos, logo, cor de
destaque e o texto de cada seção vivem em `landing_settings`, editados na aba **Site** do painel.
Instalação recém-subida abre com o texto padrão dos `*.locale.json` e a identidade do produto — nunca
página quebrada nem pedido de desculpas.

⚠️ Isso obriga a configuração a ser **runtime**, não `VITE_*`: o Vite inlina o literal no bundle, e
trocar um telefone exigiria rebuild e redeploy. `GET /public/landing-settings` é a fonte; as env
sobram só para o endereço da API.

### Estrutura é código, conteúdo é dado

O corte que impede a landing de virar CMS:

| Configurável                                     | Fixo                                        |
| ------------------------------------------------ | ------------------------------------------- |
| Marca, contatos, endereço, logo, cor de destaque | Ordem e layout das seções                   |
| Título, subtítulo e itens de cada seção          | Quais seções existem                        |
| Ligar/desligar seção                             | **Os campos do formulário de pré-cadastro** |

Os campos do formulário são colunas de `aggregate_applications` e alimentam `POST /fleet/drivers` na
aprovação. Cliente que acrescenta campo quebra o caminho inteiro, e construtor de formulário é outro
produto.

### O que o cliente escreve nunca vira marcação

A cor é um hex validado que entra como `--color-accent` em `:root` — nunca CSS. O texto de seção é
texto puro com, no máximo, o `*negrito*`/`_itálico_` das regras de conversa, renderizado por
`createElement`. `dangerouslySetInnerHTML` com conteúdo de origem externa é proibido, e aqui a origem
externa é o próprio cliente.

### O logo já existe, e ganha uma irmã pública

`company_logos` está pronta desde antes desta spec: tabela com CHECK de mime (`image/jpeg`,
`image/png`), teto de 256 KiB, `sha256`, e rotas `GET`/`PUT`/`DELETE` sob `settings.manage`. A landing
**reusa**, não inventa upload.

Falta só a leitura anônima: `GET /public/landing-logo`, com `ETag` do `sha256` já gravado e
`cache-control` público — ao contrário da rota do painel, que é `no-store` de propósito. Servir da
nossa origem é o que mantém a CSP fechada; aceitar URL colada pelo cliente exigiria `img-src *` e
desfaria a diretiva que o build monta fail-closed.

### A configuração é do grupo, e a unidade é da filial

A instalação pode ter só o CNPJ do comprador ou ter filiais. **Uma raiz de CNPJ, uma landing** — a
marca é uma só, e filial não é outro site.

`landing_settings` é por **raiz de CNPJ** (`CNPJ_ROOT_PATTERN`, os oito primeiros caracteres, que
alfanumerizam junto), não por empresa: filiais compartilham a raiz por definição legal, e derivar o
grupo dali é melhor que uma coluna de parentesco — coluna pode discordar do CNPJ, e quando discordar
quem está errado é a coluna.

O que varia por filial é endereço, telefone e nome da base, que já saem de `company_fiscal_profiles`.
Cada filial vira uma opção de **Unidade** no formulário e um cartão em "Onde estamos"; com uma
empresa só, o campo não aparece e é preenchido sozinho. `aggregate_applications.company_id` é a
filial escolhida, e a aprovação cria o motorista **naquela** empresa — que é onde o `companyId` dele
precisa estar para o MDF-e sair certo.

⚠️ **Filial não é criável hoje** — ver "O que muda no produto" abaixo. Esta spec desenha para o dia
em que for, e funciona com uma empresa desde já.

### O SDK é a identidade da landing, não a do painel

`user-module` sobe **dentro de `apps/api-transportada`, montado num prefixo próprio e num schema
Postgres próprio (`user`)**, servindo só o interessado: criar conta na landing, entrar para
acompanhar a candidatura, recuperar senha. O painel continua no módulo `identity` com Keycloak, sem
uma linha alterada.

O interessado aprovado **não migra de conta**: ele ganha um usuário de painel pelo caminho da 049
(convite → papel `aggregate`), e a conta da landing passa a apontar para o motorista criado. Trocar
o `identity` inteiro pelo SDK é feature grande e não está aqui.

### A candidatura é nossa, e nasce sem identidade

`aggregate_applications` guarda o que o interessado declarou: nome, documento, contato, RNTRC,
categoria ANTT, tipo de veículo, placa e as regiões que atende. Estado em `pending · approved ·
rejected · withdrawn`, com `reviewed_by`, `reviewed_at` e `rejection_reason`.

`POST /public/aggregate-applications` responde `202` invariável — candidatura nova, documento já
candidato e documento já motorista são indistinguíveis, pelo mesmo motivo que `POST /password-resets`
responde `204`: sem isso a rota vira consulta de "este CPF já é agregado de vocês".

A unicidade é `(company_id, tax_id)` **parcial em `pending`**: quem foi recusado pode se candidatar de
novo, quem já está na fila não duplica a fila.

### A checagem de existência acontece, e o resultado é do operador

Toda candidatura recebida é conferida contra o que já existe, dentro da mesma transação e antes de
gravar. Três perguntas, na raiz do grupo:

| Colisão                                            | Onde se olha                                        | O que acontece                                                                                             |
| -------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Já existe candidatura aberta com o mesmo documento | `aggregate_applications` `where status = 'pending'` | a nova **não é gravada**; a existente ganha `resubmitted_at` e os dados novos ficam em `latest_submission` |
| O documento já é motorista da empresa              | `fleet_drivers.tax_id` na raiz do grupo             | grava com `duplicate_driver_id` preenchido                                                                 |
| O e-mail já tem conta de landing                   | depósito do SDK (Fase 5)                            | grava com `duplicate_landing_user_id` preenchido                                                           |

**A resposta ao anônimo é `202` nos quatro casos** — inclusive quando nada colidiu. É por isso que a
checagem não pode ser um `GET /public/aggregate-applications/exists`: uma rota que responde sim ou
não é a sonda que o `202` invariável existe para fechar, e ter as duas ao mesmo tempo seria fechar a
porta e deixar a janela.

Quem lê o resultado é o operador. A linha da aba Candidaturas mostra o distintivo **"já cadastrado"**
com link para a ficha do motorista, e o botão de aprovar, nesse caso, oferece **vincular à ficha
existente** em vez de criar outra. A garantia final não é a checagem e sim o banco: a CNH continua
única por empresa e o documento do motorista também, então uma corrida entre duas aprovações perde
no `INSERT`, não na conferência prévia.

O duplicado **não é recusa automática.** Motorista desligado que volta, ficha antiga de outra unidade
e homônimo de sócio são casos reais, e recusar sozinho tiraria do operador a decisão que é dele.

### Aprovar é o caminho que já existe

`POST /aggregate-applications/{id}/approve` (`fleet.manage`, escopo `company`) chama o mesmo use case
de `POST /fleet/drivers`, na mesma transação que muda o estado da candidatura. Nada de segundo
caminho de criação de motorista: dois caminhos divergem, e o que diverge aqui é papel e vínculo.

Recusar é `POST .../reject`, com motivo obrigatório. O motivo fica na candidatura e **não** é enviado
ao interessado nesta spec — texto de recusa é conversa, e conversa tem dono.

### A landing é app próprio

`apps/frontend-landing/` — Vite + React 19, PWA, os mesmos tokens de `src/styles/index.css` (cópia por
valor, como o tema do Keycloak em `deploy/keycloak/theme/`, porque um app não importa código do
outro), CSP própria gerada no build pelo mesmo padrão fail-closed do `frontend-transportada`.

Não é rota do painel: misturar site anônimo com bundle autenticado faria o visitante baixar o painel
inteiro e daria à navegação manual de `main.tsx` um ramo público que ela não tem.

### A aba Site é a exceção declarada de "configuração perto do efeito"

A regra manda o painel de configuração morar na tela onde o efeito aparece. Aqui o efeito aparece em
**outro app**, e não há tela do painel que o hospede. A aba **Site** fica em `company-settings`, com
link de pré-visualização, e `SETTINGS_PANEL_PLACEMENT` registra que este é o caso em que a regra não
fecha — para a exceção ser decisão escrita, não esquecimento.

## O que muda no produto (leitura do código, não suposição)

Três coisas estão no caminho, e só a primeira é desta spec.

### Não existe como criar a segunda empresa — e isso é spec própria

`PROVISION_COMPANY_ID` é **singular**: `environment-provisioning.service.ts` provisiona uma empresa e
um primeiro administrador a partir da configuração do deploy. `POST /companies` não existe, e
`companies.manage` é `Exclude`ída de `CompanyPermission` em `authorization.policy.ts` — permissão
reservada, sem consumidor, exatamente como a ADR-0021 registrou.

Hoje **filial é indistinguível de outro cliente**: seria uma segunda linha em `companies` sem relação
declarada com a primeira, e não há caminho para criá-la.

### O token carrega uma empresa só

`authentication.service.ts:52` lê `company_id` do JWT e `tenant-context.service.ts` resolve o
membership daquela empresa. Um operador de matriz que precise ver a filial precisaria de **outro
token** — não há troca de empresa na sessão, nem no painel, nem no Keycloak.

### O que **não** precisa mudar

`company_fiscal_profiles` já está certa para filial: `companyId` é PK (um perfil por empresa) e `cnpj`
é único global — cada filial com seu CNPJ, mesma raiz. `company_logos` idem. Todo repositório já
filtra por `companyId`, e os contratos de `tenant-safety` já cobrem o isolamento.

**Recomendação:** abrir **spec 054 — a filial existe** com criação de empresa irmã por raiz de CNPJ,
troca de empresa na sessão e o que mais a leitura acima levantar. A 053 não a implementa: ela desenha
`landing_settings` por raiz e o campo Unidade, que com uma empresa é campo oculto e com N funciona no
dia em que a 054 entregar.

## Fora do escopo

- **Criar filial, e trocar de empresa na sessão.** Spec 054, acima.
- **Login do agregado no painel.** O papel `aggregate` segue sem acesso, como a 049 registrou.
- **Substituir o `identity` pelo SDK.** Auditoria, item 3 — ADR própria.
- **Consulta de antecedentes e de processos.** Não há API pública que resolva, o momento certo é a
  aprovação e não o cadastro, e reclamatória trabalhista como critério de recusa é risco de
  discriminação. Entra como `background-check.port.ts` com implementação nula em spec própria.
- **Notificar o interessado da recusa.** `NOTIFICATION_TEMPLATE_KEY` não ganha chave nesta spec.
- **Criptografar o documento da candidatura.** Cai na ADR-0039, que segue pendente — mas
  `aggregate_applications` guarda CPF e entra na mesma decisão quando ela for executada.
- **Rate limit.** Não existe limitador nesta API; as rotas públicas novas são registradas em
  `docs/SECURITY.md` junto das duas que já existiam.
- **SEO, blog, formulário de contato comercial.** Landing é captação de agregado.

## Histórias

### P1 — A instalação liga a landing sem tocar em código

**Given** uma instalação recém-vendida
**When** o administrador preenche a aba Site e sobe o logo
**Then** a landing mostra a marca dele **sem rebuild e sem redeploy**, e antes disso já estava no ar
com o texto padrão e a identidade do produto.

### P1 — O interessado se apresenta sozinho

**Given** um visitante na landing
**When** ele preenche nome, documento, contato, RNTRC e veículo e envia
**Then** a candidatura fica gravada como `pending` e a tela agradece, sem revelar se aquele documento
já era conhecido.

### P1 — O documento repetido é achado sem ser anunciado

**Given** um documento que já é motorista da empresa
**When** ele é enviado pela landing
**Then** a resposta é `202` e a tela agradece exatamente como agradeceria a um desconhecido, **e** a
linha na aba Candidaturas nasce marcada como já cadastrada, com link para a ficha.

### P1 — Candidatura repetida não empilha fila

**Given** uma candidatura `pending` daquele documento
**When** a pessoa envia de novo
**Then** continua havendo **uma** candidatura, com `resubmitted_at` atualizado e os dados novos
guardados, e a resposta continua `202`.

### P1 — O operador aprova e o agregado nasce inteiro

**Given** uma candidatura `pending` na tela da Frota
**When** o operador aprova
**Then** existe motorista com perfil `aggregate` **e** usuário da empresa, e a candidatura fica
`approved` apontando para o motorista — tudo numa transação.

### P1 — Anônimo não cria identidade

**Given** as rotas públicas da landing
**When** elas são chamadas mil vezes
**Then** nenhum usuário existe no Keycloak e nenhum motorista existe na frota.

### P1 — Nenhum nome de transportadora no código

**Given** o repositório
**When** se busca por nome de cliente em `src/`
**Then** não há ocorrência: tudo vem de `landing_settings`, e a instalação sem configuração sobe com
o nome genérico do produto.

### P1 — O que o cliente escreve não executa

**Given** um administrador que digita `<script>` ou uma cor inválida no painel
**When** a landing renderiza
**Then** o texto aparece literal e a cor cai no token padrão — nada é interpretado como marcação.

### P2 — A filial é unidade, não outro site

**Given** uma instalação com matriz e filiais na mesma raiz de CNPJ
**When** o interessado abre o formulário
**Then** ele escolhe a **Unidade**, a candidatura nasce naquela empresa, e com uma empresa só o campo
nem aparece.

### P2 — O interessado acompanha a candidatura

**Given** o interessado que criou conta na landing pelo SDK
**When** ele entra
**Then** vê o estado da própria candidatura, e nada de ninguém mais.

### P2 — A landing usa os nossos campos

**Given** o formulário de pré-cadastro
**When** a tela é desenhada
**Then** altura, padding e corpo de texto vêm dos tokens `--field-*`, e nenhum componente renderizado
de `@adatechnology/user-ui` aparece na árvore.
