# 062 — o WhatsApp já está modelado · tasks

> 🤖 Modelo: `sonnet` de padrão. T001 e T004 são 🧠 (`opus`) — credencial selada e a costura do
> driver são o que não se conserta depois de vazar ou de virar dois caminhos de envio.

## As quatro cláusulas em aberto, respondidas (2026-08-28)

| Dúvida                     | Resposta                                            | Consequência                                                                                   |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Variáveis de ambiente      | **O cliente tem as credenciais e as põe no `.env`** | Escrevo schema, `.env.example` e boot fail-closed; nenhum segredo entra no repositório         |
| Um número ou um por filial | **Um por filial, já agora**                         | A credencial é **por empresa** — ver ⚠️ abaixo                                                 |
| Motorista responde?        | **Responde, e isso vira estado**                    | A frente 3 inclui o motorista; o contrato canal-agnóstico da 057 D2 ganha o segundo consumidor |
| Quem atende a inbox        | **Um bot e um atendimento manual**                  | Fluxo determinístico primeiro, com handoff para gente; a inbox precisa de papel próprio        |

⚠️ **"Filial" não existe como entidade — e não precisa existir.** A spec 054 está apenas reservada.
Neste produto **cada CNPJ já é uma `companies`** (CLAUDE.md: "uma transportadora costuma ter mais de
um CNPJ"), e o isolamento por `companyId` é o que separa uma unidade da outra. Então "um número por
filial" é **um número por empresa**, com a credencial em `whatsapp_channels.company_id` — sem
entidade nova e sem esperar a 054. Se um dia a 054 criar sub-filial **dentro** de uma empresa, a
chave precisa ser revisitada; está escrito aqui para quem chegar depois não redescobrir.

## Correção da auditoria da spec (verificado no código instalado, 2026-08-28)

A spec afirma que o driver mora em `notification-module/src/channelDrivers.ts` e
`notification-module/src/whatsappDriver.ts`. **Não mora.** Verificado:

- `WhatsAppDriverPort`, `ChannelDrivers` e `createWhatsAppDriverFromChannel()` estão em
  **`@adatechnology/notification-contracts`** — já instalado, versão `0.1.0-rc.2`;
- `notification-module@0.1.0-rc.3` (o instalado) não exporta driver nenhum de WhatsApp;
- `WhatsAppSendingChannel`, que o driver recebe, é uma interface **estrutural de dois métodos**:
  `sendText(to, body)` e `sendTemplate({to, templateName, languageCode, bodyParameters})`.

**A premissa da spec continua de pé, e fica mais barata:** o `WhatsAppMessageProvider` de
`@adatechnology/meta-whatsapp-provider` já tem exatamente esses dois métodos. A frente 1 **não
precisa do `meta-whatsapp-module`** — que traz migrations, modelo de conversa e webhook. Ele entra na
frente 2, quando houver conversa a guardar.

## Fase 1 — Notificação (P1)

> 🤖 Modelo: `sonnet`, com T001 e T004 em `opus`

### T001 🧠 ✅ — `whatsapp_channels`: a credencial por empresa, selada

Tabela por empresa com o número (`phone_number_id`), o WABA e o **token selado** — envelope
`A256GCM` com AAD `transportada:whatsapp-channel:v1:${companyId}:${channelId}`, o mesmo desenho da
credencial da Nota RP. O token em claro nunca é persistido nem logado.

- **Aceite:** `company_id` único; token só sai por `openEnvelope`; migration + rollback
- **Verificação:** `make migration-test` + contrato de schema

### T002 ✅ — Configuração e boot fail-closed

`WHATSAPP_API_VERSION` e `WHATSAPP_BASE_URL` (mock local) no schema de env. Empresa **sem** linha de
canal não derruba o boot — ela simplesmente não tem WhatsApp, e a notificação cai no e-mail. O que
falha alto é canal cadastrado com envelope ilegível.

- **Aceite:** `.env.example` documentado; ausência de canal é ausência, não erro
- **Verificação:** contrato de configuração

### T003 ✅ — As rotas do canal (`settings.manage`)

`GET`/`PUT`/`DELETE /company-settings/whatsapp-channel`. A leitura devolve número e WABA; **nunca**
o token, nem mascarado — máscara que permite confirmar um token é confirmação.

- **Aceite:** o token não aparece em resposta nenhuma; contrato guarda isso por extenso
- **Verificação:** `bun test ./test/whatsapp-channel-http.contract.test.ts`

### T004 🧠 — O driver injetado no `notification-module`

Gateway fino que satisfaz `WhatsAppSendingChannel` sobre o `WhatsAppMessageProvider`, e
`createWhatsAppDriverFromChannel()` ligando `channels.whatsapp` no factory. **Um caminho de envio, não
dois:** quem manda WhatsApp é o módulo de notificação, como já é com e-mail.

- **Aceite:** notificação com canal `whatsapp` chega ao provider; sem canal cadastrado, cai no e-mail
- **Verificação:** contrato do factory + integração com mock HTTP

### T005 — Convite e recuperação de senha por WhatsApp

`DELIVERABLE_CHANNELS` já tem `'whatsapp'`, e o gateway recusa tudo que não é e-mail. Passa a
aceitar, pelo mesmo trilho do worker.

- **Aceite:** convite com canal `whatsapp` entrega; sem canal cadastrado, erro claro no envio
- **Verificação:** contrato do gateway + `worker` integration

## Fase 2 — Conversa (P2)

> 🤖 Modelo: `opus` 🧠 na adoção do módulo e na segurança do webhook

### T006 🧠 — `meta-whatsapp-module` e o webhook assinado

### T007 — `ConversationsWorkspace` no painel, com tema por contrato

⚠️ **A skill `adatechnology-ui` manda aqui, e ela é dura:** consumir a **tela composta inteira**, com
a página do produto em 30–170 linhas de fiação, `labels` e slots. Remontar o grid à mão é o que fez as
telas divergirem entre os três produtos, e é rejeitado em code review. Falta uma porta? a mudança é
**no pacote**, com changeset, e o produto sobe a versão — nunca copiar a tela para dentro para
ajustar um detalhe. Cores e vocabulário entram por contrato: `theme` (→ `--cv-*`) e `labels` montados
a partir dos nossos locales e dos tokens de `src/styles/index.css`.

### T008 🧠 — O papel do atendimento

O cliente vai ter **bot e atendimento manual**: a inbox precisa de papel próprio (`attendant`), com
permissão só de conversa — não vê frota, faturamento nem fiscal. O separador e o operador não a
recebem de carona, pela mesma razão que `trip.manage` nasceu separado de `fleet.manage`.

## Fase 3 — Execução (P3)

> 🤖 Modelo: `opus` 🧠 — é onde mensagem vira estado

### T009 🧠 — O grafo do fluxo determinístico, com handoff

### T010 🧠 — A resposta do cliente vira agendamento (060 D3)

### T011 🧠 — A resposta do motorista vira evento de entrega

O motorista **responde** (decisão de 2026-08-28), e o contrato canal-agnóstico da 057 D2 passa a ter
dois consumidores — que é exatamente o que ele foi desenhado para suportar. A confirmação por
mensagem grava o mesmo evento que o PWA grava, com a mesma idempotência.

## Ordem

```
T001 ──> T002 ──> T003 ──┐
                         ├──> T004 ──> T005 ──> T006 ──> T007 ──> T008 ──> T009 ──> T010 ──> T011
                         ┘
```

**A frente 1 é entregável sozinha**, e é o que paga a infraestrutura: convite, recuperação de senha e
os avisos das specs 059/060 passam a sair por WhatsApp sem nenhuma tela nova.

## Evidência

### T001 — a credencial selada (2026-08-28)

`whatsapp_channels`: uma linha **por empresa** — que é "por filial" neste produto —, com
`phone_number_id`, `waba_id`, o número de exibição e o **token dentro do envelope**. Não existe
coluna de token em claro, e o contrato falha se alguém acrescentar uma.

O AAD é `transportada:whatsapp-channel:v1:${companyId}:${channelId}`, o mesmo desenho da Nota RP. O
contrato prova a propriedade que ele compra, com um cofre de mentira que **respeita o AAD**: envelope
copiado para outra empresa não abre, e nem para outro canal da mesma empresa. Chaveiro fora do ar e
AAD que não casa respondem **igual** — distinguir contaria a quem tem acesso à API se aquela empresa
tem canal cadastrado.

Três CHECKs de formato, porque id trocado por número só apareceria no primeiro envio, com o cliente
do outro lado esperando: os dois identificadores da Meta são numéricos, e o de exibição é E.164 sem o
`+` (ou vazio, que é o padrão — ele é conveniência de tela, não requisito de envio).

O rollback **recusa reverter** com canal ativo, e avisa que o token selado **não se recupera**: ele só
existe dentro do envelope, e quem reverter precisa pegá-lo de novo no painel da Meta.

```
make migration-test                          # 86 pass / 0 fail
bun run --cwd apps/api-transportada test     # 3630 pass / 0 fail
typecheck · lint · format                    # limpos
```

#### Buracos declarados

- **Ninguém escreve nem lê essa tabela ainda** — as rotas são a T003 e o driver a T004. Hoje ela é
  estrutura sem consumidor, de propósito: a credencial vem antes de quem a usa.
- **Sem rate limit** nas rotas que virão, como no resto desta API (achado já registrado em
  `docs/SECURITY.md`).

### T002 — a configuração, e o que ela deliberadamente não carrega (2026-08-28)

Duas variáveis, e **nenhum segredo**: `WHATSAPP_API_VERSION` (padrão `v23.0` — a Meta a exige no
caminho e ela envelhece) e `WHATSAPP_BASE_URL` (vazio aponta para a Graph API de verdade; preenchida,
para um mock local em dev). O token, o número e o WABA são **por empresa**, selados no banco pela
T001 — uma variável global de token daria um token para toda a instalação, e "um número por filial"
viraria um número para todas.

O contrato falha se alguém acrescentar `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` ou
`WHATSAPP_WABA_ID` ao schema de ambiente — é a regra escrita como teste, não como comentário.

**O boot não é fail-closed aqui, e isso é decisão, não esquecimento.** A spec dizia "boot falhando
com mensagem clara enquanto a variável não existir"; com a credencial por empresa isso ficaria
errado: instalação sem WhatsApp deixaria de subir por causa de um canal que ela não usa, e empresa
sem canal cadastrado é **ausência**, não erro — a notificação cai no e-mail. O que falha alto é canal
**cadastrado** com envelope ilegível, e isso é T004. As duas variáveis são opcionais, e a versão fora
do formato da Graph API é recusada no boot: erro de digitação que só apareceria no primeiro envio.

```
bun run --cwd apps/api-transportada test              # 3634 pass / 0 fail
bun run --cwd apps/api-transportada test:integration  # 176 pass / 0 fail
typecheck · lint · format:check                       # limpos
```

#### Buraco declarado

- **`.env.example` e `.env` ganharam as duas variáveis**, mas nenhuma credencial foi cadastrada —
  isso é a tela da T003, e o token é você quem põe, no painel, nunca por aqui.

### T003 — as rotas do canal (2026-08-28)

`GET`/`PUT`/`DELETE /company-settings/whatsapp-channel`, as três sob `settings.manage` — quem
configura o canal decide por qual número a empresa fala com o cliente.

**O token não volta, nem mascarado.** A projeção é lista fechada e o contrato compara as chaves por
extenso; máscara que permite confirmar um token é confirmação, porque quem tem o começo e o fim
reconhece o segredo que vazou por outro caminho. O que a tela sabe é `tokenConfigured`.

Quatro decisões que ficaram no código:

- **cadastro novo exige token; atualização não.** Ninguém relê o token para redigitá-lo, e exigi-lo a
  cada correção de número mandaria o operador buscá-lo na Meta de novo. Canal novo sem token é `422`
  com o campo nomeado — gravar assim deixaria a tela dizendo "configurado" para um canal que falha no
  primeiro envio;
- **o id do canal é decidido antes de a linha existir**, porque ele entra no AAD: o envelope é selado
  para a linha, e a linha nasce com o id que o selo prometeu;
- **empresa sem canal é `null` e `200`**, não `404`: ausência é o caso normal, e a tela abre vazia;
- **canal desligado não é oferecido ao envio** (`findSecret` filtra por `active`), mas continua
  visível na configuração — desligar é o botão que o operador tem para parar o fluxo, e não é apagar.

⚠️ **`tokenConfigured` sai da existência da chave no envelope, não de `is not null`.** A coluna é
`not null` e o canal sem token grava `{}` — o predicado ingênuo responderia "tem token" para todo
canal. A checagem é `secret_envelope ? 'ciphertext'`, feita **no banco**, justamente para o segredo
não subir na projeção.

```
bun run --cwd apps/api-transportada test              # 3646 pass / 0 fail
bun run --cwd apps/api-transportada test:integration  # 179 pass / 0 fail
typecheck · lint · format:check                       # limpos
```

A integração prova o que só o banco prova: atualizar sem token **preserva** o que está selado (e a
versão sobe, que é o que a tela usa para detectar edição concorrente), canal sem envelope não se diz
configurado, e canal desligado some do envio sem sumir da tela. Um erro meu no caminho vale registro:
o primeiro teste reusou o mesmo `phone_number_id` em duas empresas e **o unique global o pegou** — que
é exatamente o que ele existe para pegar.

#### Buracos declarados

- **Não há tela** — o painel ainda não tem o formulário do canal. Cadastrar hoje é `PUT` na mão.
- **Sem rate limit**, como o resto desta API (achado já em `docs/SECURITY.md`).
- **Ninguém envia nada ainda**: `findSecret` existe e não tem chamador até a T004.
