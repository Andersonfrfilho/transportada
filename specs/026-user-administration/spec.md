# Feature 026 — Administração de usuários e perfis

## Problema e resultado

Staging subiu inteiro (api, worker, cron, frontend, keycloak) e **ninguém consegue entrar**. Não
existe caminho suportado para criar um usuário num ambiente que não seja `local` ou `test`: o
semeador de identidade recusa por ambiente (`apps/api-transportada/src/database/local-identity-seed.service.ts:21`,
`const ALLOWED_ENVIRONMENTS = new Set(['local', 'test'])`, verificado em `:55`). Hoje a única saída é
criar o usuário à mão no admin console do Keycloak e inserir `identity_users`, `external_identities`,
`user_company_memberships` e `membership_roles` por SQL dentro do contêiner — exatamente o que
`docs/spec/railway.md:91-92` documenta como passo manual por ambiente.

O resultado desta feature: um administrador de empresa cria, ativa, desativa e atribui perfil a
usuários pela própria aplicação, na página de configurações que já existe, sem tocar no Keycloak e
sem que ninguém — nem a I.A., nem o operador — digite senha de outra pessoa. A ativação é por
**código**, entregue por canal configurável (e-mail, SMS ou WhatsApp), para que o app mobile futuro
consuma o mesmo fluxo sem uma segunda implementação.

## Descobertas (levantadas antes de especificar)

1. **`users.manage` já existe e está morta.** A permissão é declarada em
   `apps/api-transportada/src/identity/domain/authorization.policy.ts:8`, concedida a `company-admin`
   em `:42` e já consta na allowlist do frontend em
   `apps/frontend-transportada/src/modules/identity/queries/useAuthMe.query.ts:20`. **Nenhuma rota a
   consome.** O vocabulário de permissão antecipou esta feature; falta a implementação.

2. **O ator de plataforma está previsto no tipo e continua sem uso — e assim fica.**
   `companies.manage` (`authorization.policy.ts:7`) é inatribuível a qualquer papel de empresa —
   `CompanyPermission = Exclude<TransportadaPermission, 'companies.manage'>` em `:38` e o filtro em
   `:136` a removem de `resolveCompanyPermissions`. Existe até `PlatformAuthorizationPolicy`
   (`:117-119`), unido em `RouteAuthorizationPolicy` (`:121`). Nenhuma rota declara
   `scope: 'platform'`, e num produto de um deploy por empresa **nenhuma vai declarar**.

3. **`@adatechnology/nestjs-keycloak-admin` existe, com o contrato certo, mas não serve.** Expõe
   `createUser`, `updateUser`, `resetPassword`, `toggleUserEnabled`, `deleteUser`,
   `updateUserAttributes` e `sendVerifyEmail` (`src/keycloak-admin.interface.ts`) — é a inspiração
   pedida. Mas está acoplado ao NestJS (TransportAdA é Bun sem framework) e autentica por **password
   grant no realm master**: `src/keycloak-admin.client.ts:82-85` usa
   `KEYCLOAK_ADMIN_GRANT_TYPE_PASSWORD` com `body.append("password", this.config.adminPassword)`.
   Isso contraria a regra de M2M do ecossistema, que exige _client credentials_ e proíbe Resource
   Owner Password Credentials (`~/.claude/rules/rules/infrastructure/…` §2). **Inspiração, não
   consumo.**

4. **Não existe equivalente agnóstico.** `@adatechnology/keycloak-jwt` (já consumido,
   `apps/api-transportada/package.json`) e `@adatechnology/auth-keycloak` só **validam** token — não
   administram.

5. **O canal plugável já existe: o trio de notificação.** `@adatechnology/notification-contracts`
   (`0.1.0-rc.0`) declara `NOTIFICATION_CHANNEL` com `inbox`, `push`, `email`, `whatsapp` e `sms`
   (`src/notification.types.ts`), portas de driver por canal (`SendEmailParams`,
   `SendSmsParams`, `SendWhatsAppParams` em `src/channelDrivers.ts`), `DeliveryAttemptResult`
   discriminado, `NotificationPreference`, `NotificationTemplate` e `CompanyId`/`UserId` no
   contrato. `@adatechnology/notification-module` guarda estado com Drizzle;
   `@adatechnology/email-provider` entrega por SMTP/Resend/SES; `@adatechnology/meta-whatsapp-provider`
   (`0.2.0-rc.3`) entrega WhatsApp. **Não inventar abstração de canal** — a feature consome o trio.

6. **Nenhuma app tem infraestrutura de envio hoje.** Varredura por `smtp|nodemailer|mailpit|sendEmail|notification`
   em `apps/*/src` não retorna nada. O trio entra como dependência nova, não como substituição.

7. **A página de configurações existe e é o lugar certo.**
   `apps/frontend-transportada/src/modules/company-settings/` já tem perfil, logo, certificado,
   faturamento, CT-e e MDF-e. A rota correspondente
   (`apps/api-transportada/src/companies/presentation/company-settings.routes.ts`) tem apenas
   `GET` (`:58`), `GET` de consulta de CNPJ (`:72`) e `PATCH` (`:85`), todas sob `SETTINGS_MANAGE_POLICY`
   e sempre sobre a empresa **já resolvida do token**. Serve para administrar usuários de uma empresa
   existente; **não** responde quem cria a primeira.

8. **Os perfis já estão fechados.** `COMPANY_ROLES` em
   `apps/api-transportada/src/database/identity.schema.ts:29-37`: `company-admin`, `finance`,
   `fiscal`, `operator`, `viewer`, `driver`. A feature atribui perfis existentes; não cria perfis novos
   nem permissão por usuário.

## Decisões tomadas

| Decisão                              | Escolha                                                                             | Por quê                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Onde mora o cliente de administração | Pacote novo `@adatechnology/keycloak-admin`, agnóstico, ao lado de `keycloak-jwt`   | Escolha do usuário; o de NestJS não roda em Bun sem framework             |
| Como o pacote autentica              | _Client credentials_ com service account do realm, escopo `realm-management` mínimo | Regra de M2M do ecossistema; nunca password grant                         |
| Como o usuário é ativado             | **Código** de uso único, com validade, entregue por canal                           | O mobile futuro não abre link de e-mail; código funciona nos três canais  |
| Por onde o código sai                | Trio de notificação (`notification-contracts` + provider por canal)                 | Já modela `email`/`sms`/`whatsapp`; construir outro seria duplicar        |
| Onde o canal se escolhe              | Seção nova na página de configurações da empresa                                    | Pedido explícito do usuário; é onde já vivem certificado, logo e defaults |
| Quem administra                      | `company-admin`, via `users.manage`, sempre no escopo do token                      | A permissão já existe e já pertence ao papel certo                        |
| Vias de ativação                     | **Duas**: senha temporária definida pelo admin **ou** código por canal              | Escolha do usuário; a senha temporária entrega acesso sem depender do worker de notificação |
| Onde a foto do usuário mora          | Bucket privado (MinIO/S3) + rota autenticada da API; Keycloak guarda só a referência | `security.md` §7 proíbe bucket público para dado pessoal; atributo de IdP não guarda binário |
| Como o usuário loga                  | `username` escolhido pelo admin, editável e sincronizado com o Keycloak             | Escolha do usuário; o UUID sintético do convite não é decorável e o contato pode ser telefone |
| Quem é a fonte da verdade do perfil  | O banco da aplicação; toda escrita empurra para o Keycloak na mesma operação        | O Keycloak não conhece empresa nem perfis do produto; divergência silenciosa é o pior estado |

## Arranque do ambiente — decidido

**O produto é um deploy por empresa.** A empresa não é criada por ninguém em tempo de execução: ela
**é** o ambiente. Logo, não existe `POST /companies`, não existe ator de plataforma e
`companies.manage` continua reservada e sem consumidor.

O arranque é **provisionamento**: um comando idempotente na imagem, rodado uma vez por ambiente,
que garante a empresa única (a partir da configuração do ambiente) e o primeiro `company-admin`. A
partir daí toda criação de usuário passa pelo produto, que é o objeto desta feature.

A decisão está registrada em `docs/adr/0021-one-deployment-per-company.md`, e `CLAUDE.md`,
`README.md`, `docs/spec/constitution.md` e `docs/spec/railway.md` já foram alinhados (T000).

O código carrega `companyId`, membership e contratos de isolamento em toda parte. Essa maquinaria
**permanece invariável** — uma transportadora costuma ter mais de um CNPJ, e o isolamento é defesa
em profundidade já paga e o seam que os testes usam. O que muda é o rótulo: multiempresa é
capacidade do produto, não modelo comercial.

## Requisitos

### R1 — Pacote `@adatechnology/keycloak-admin`

- Agnóstico de framework, TypeScript estrito, sem dependência de runtime além de `zod` (padrão dos
  irmãos), publicável com `publishConfig.access: public`.
- Autentica por client credentials; cacheia o token em memória e renova antes de expirar.
- Contrato mínimo, inspirado no de NestJS: `createUser`, `findUserByEmail`, `updateUser`,
  `setEnabled`, `updateAttributes`, `deleteUser`, `setTemporaryPassword`.
- Erros tipados (`KeycloakAdminError`) com código estável; **nunca** carregam senha, token ou
  segredo no `message` nem no contexto.
- Configuração validada no boot: `baseUrl`, `realm`, `clientId`, `clientSecret`.

### R2 — Convite e ativação por código

- `POST` de convite cria o usuário no Keycloak **desabilitado**, cria `identity_users`,
  `external_identities` e `user_company_memberships` + `membership_roles` na empresa do token, numa
  transação só.
- O código de ativação é aleatório criptograficamente, de uso único, com validade curta e guardado
  **apenas como hash**. Tentativas erradas são limitadas por usuário.
- Trocar o código válido por definição de senha habilita o usuário no Keycloak e conclui a
  ativação. **A senha nunca transita pela API da aplicação nem é gravada por ela** — a definição
  acontece contra o Keycloak.
- Toda chamada ao Admin API endereça o usuário pelo **`subject` do Keycloak**, guardado em
  `external_identities`. O `identity_users.id` da aplicação é outro identificador e não serve.
- Reenvio de código invalida o anterior.
- O mesmo par de endpoints atende web e o mobile futuro: o fluxo é código + canal, nunca link.

### R3 — Canal de entrega configurável

- A empresa escolhe o canal de ativação entre `email`, `sms` e `whatsapp`, nas configurações.
- O envio é assíncrono, pelo worker, e **nunca** bloqueia a resposta do convite.
- Falha de entrega não invalida o código; é observável e permite reenvio.
- Nenhum log ou telemetria carrega o código, o telefone ou o e-mail em claro (`security.md` §1).

### R4 — Administração pela página de configurações

- Seção "Usuários e perfis" em `company-settings`, sob `users.manage`, listando usuários da empresa
  do token com nome, contato mascarado, perfis e situação.
- Ações: convidar, reenviar código, ativar/desativar, alterar perfis, remover vínculo.
- Um `company-admin` não pode remover o próprio vínculo nem retirar de si o último `company-admin` da
  empresa — a empresa nunca fica sem administrador.
- Toda ação sensível grava trilha de auditoria com ator, alvo, IP e horário (`security.md` §10).

### R5 — Isolamento de tenant

- Toda consulta e toda escrita filtram por `context.companyId`, vindo do token.
- Contrato de tenant safety obrigatório em `test/*-schema/` para cada query nova, provando que um
  admin da empresa A não enxerga nem altera usuário da empresa B.

### R6 — Perfil editável e sincronizado com o Keycloak

- O admin altera nome, `username`, e-mail, canal e endereço de contato de qualquer usuário da
  empresa. O banco é a fonte da verdade; a mesma operação empurra `username`, `email`, `firstName`,
  `lastName` e os atributos para o Keycloak.
- Toda mudança de situação propaga: suspender chama `setEnabled(false)`, reativar chama
  `setEnabled(true)`, remover o vínculo desabilita o usuário no Keycloak.
- O convite passa a gravar no Keycloak o mesmo que o provisionamento do primeiro admin já grava:
  `firstName`, `lastName` e o atributo `company_id`.
- **Falha no Keycloak reprova a operação** — a resposta é erro, nunca "salvou aqui, sincroniza
  depois". Como não há transação distribuída entre banco e provedor de identidade, a ordem das
  chamadas é escolhida para que qualquer falha parcial deixe o estado **mais restritivo**:
  desabilitar chama o Keycloak **antes** do banco; habilitar chama o banco **antes** do Keycloak.
  Nos dois casos, uma falha no meio deixa o usuário sem acesso — nunca com acesso indevido.
- Usuário com vínculo ativo em **outra** empresa não é desabilitado no Keycloak ao ser suspenso ou
  removido de uma: o `enabled` é global no realm, o vínculo é por empresa.
- `username` é único no realm; colisão vira erro de domínio próprio, com 409.

### R7 — Foto do usuário

- Upload por rota autenticada sob `users.manage`; o próprio usuário pode trocar a sua.
- O binário vai para o bucket privado, sob `tenants/<companyId>/users/<userId>/photo/<objectId>`.
  Nome de arquivo **nunca** carrega dado pessoal (`security.md` §7).
- Leitura só por rota autenticada da API, que resolve o objeto e devolve o conteúdo; o Keycloak
  guarda apenas a referência no atributo `picture`.
- Tipo e tamanho validados na fronteira: `image/jpeg`, `image/png` ou `image/webp`, com teto
  explícito de bytes. Trocar a foto substitui a anterior.

### R8 — Ativação por senha temporária

- Além do código por canal (R2), o admin pode definir uma senha temporária no ato do convite.
- A senha vai direto ao Keycloak por `setTemporaryPassword`, que força a troca no primeiro login.
  **A aplicação não grava, não loga e não devolve a senha em resposta nenhuma.**
- Usuário criado por essa via nasce habilitado e sem convite pendente; as duas vias nunca coexistem
  para o mesmo usuário no mesmo momento.

## Fora de escopo

- Criar perfis novos ou permissão por usuário — `COMPANY_ROLES` está fechado.
- Autoatendimento de cadastro (self-signup) e recuperação de senha esquecida.
- Federação de identidade, SSO corporativo, MFA.
- Painel de plataforma (listar/administrar todas as empresas) — não existe nesse modelo de distribuição (ADR-0021).
- App mobile: esta feature entrega o contrato que ele vai consumir, não o cliente.

## Critérios de aceite

1. Um `company-admin` convida um usuário pela página de configurações e o convidado recebe um código
   pelo canal configurado.
2. O convidado troca o código por senha, é habilitado e entra na aplicação enxergando **apenas** a
   empresa que o convidou.
3. Código expirado, já usado ou errado é recusado sem revelar qual dos três é o caso.
4. Um admin da empresa A recebe 403/404 ao tentar qualquer ação sobre usuário da empresa B, provado
   por contrato.
5. A tentativa de remover o último `company-admin` é recusada com erro de domínio próprio.
6. Nenhuma senha, código, token ou contato em claro aparece em log, evidência ou trilha de auditoria.
7. Um admin cria um usuário com senha temporária, o usuário entra com ela e o Keycloak exige a troca
   no primeiro login — sem worker de notificação envolvido.
8. Alterar nome, `username`, e-mail ou contato reflete no Keycloak na mesma operação; com o Keycloak
   fora do ar a operação falha e o banco não muda.
9. Suspender, reativar e remover vínculo refletem o `enabled` do usuário no Keycloak.
10. A foto sobe, é servida por rota autenticada e não é acessível por URL pública do bucket.
11. `make check` verde.
