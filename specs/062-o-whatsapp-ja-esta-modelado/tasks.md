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

### T004 🧠 ✅ — O driver injetado no `notification-module`

Gateway fino que satisfaz `WhatsAppSendingChannel` sobre o `WhatsAppMessageProvider`, e
`createWhatsAppDriverFromChannel()` ligando `channels.whatsapp` no factory. **Um caminho de envio, não
dois:** quem manda WhatsApp é o módulo de notificação, como já é com e-mail.

- **Aceite:** notificação com canal `whatsapp` chega ao provider; sem canal cadastrado, cai no e-mail
- **Verificação:** contrato do factory + integração com mock HTTP

### T005 ✅ — Convite e recuperação de senha por WhatsApp

`DELIVERABLE_CHANNELS` já tem `'whatsapp'`, e o gateway recusa tudo que não é e-mail. Passa a
aceitar, pelo mesmo trilho do worker.

- **Aceite:** convite com canal `whatsapp` entrega; sem canal cadastrado, erro claro no envio
- **Verificação:** contrato do gateway + `worker` integration

## Fase 2 — Conversa (P2)

> 🤖 Modelo: `opus` 🧠 na adoção do módulo e na segurança do webhook

### T006 🧠 ✅ — `meta-whatsapp-module` e o webhook assinado

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

### T004 — o driver injetado no `notification-module` (2026-08-28)

**Um caminho de envio, não dois.** Quem manda WhatsApp é o módulo de notificação, como já é com
e-mail: o produto injeta um `WhatsAppDriverPort` em `channels.whatsapp` e some do assunto. Nenhum
caso de uso do produto fala com a Meta.

Três peças, cada uma com um trabalho só:

- **`meta-whatsapp-sending.gateway.ts`** traduz o `WhatsAppMessageProvider` para a forma
  `WhatsAppSendingChannel` que o `notification-contracts` descreve. Os dois nomeiam a mesma coisa de
  jeitos diferentes — `waMessageId` de um lado, `externalMessageId` do outro —, e traduzir aqui é o
  que mantém os pacotes independentes: o de notificação não sabe o que é Meta, o da Meta não sabe o
  que é entrega. O gateway **não engole erro**: quem classifica falha da Graph API é
  `createWhatsAppDriverFromChannel`, que lê `code` e `statusCode` da exceção para decidir entre
  tentar de novo, desistir e apagar o destino. Um `try/catch` ali apagaria essa informação e todo
  erro viraria "desconhecido, tente de novo".
- **`whatsapp-notification-driver.service.ts`** resolve a credencial e abre o envelope **a cada
  envio**, não uma vez no boot: token rotacionado no painel da Meta passa a valer na próxima
  mensagem, e canal desligado para de enviar na mesma hora. Cobrar restart por isso transformaria
  "desligar o canal" num pedido de manutenção.
- **`findActiveCredentials()`**, com teto de dois, é o que o envio enxerga do banco.

⚠️ **O buraco central, e ele é do SDK, não nosso: `WhatsAppDriverPort.send` não recebe empresa.**
O `notification-module` estreita a `delivery` para `{channel, deviceId}` antes de chamar o driver,
mesmo tendo `job.companyId` na mão — então o driver não tem como escolher entre dois números. Com uma
empresa só na instalação a escolha é única e não há o que errar; com duas, escolher qualquer uma
mandaria a mensagem do cliente **pelo número da outra filial**, e ele responderia para lá. Por isso
dois canais ativos é `permanent('channel_ambiguous')`, com o log dizendo quantos havia: silêncio
declarado é melhor que a conversa no telefone errado.

**Fechar isso é mudança no pacote, não aqui** (regra de módulos plugáveis: falta porta, muda-se o
pacote com changeset). O patch é pequeno e está medido: `companyId` em `SendWhatsAppParams`
(`notification-contracts/src/channelDrivers.ts`), o campo repassado em
`DispatchDelivery.use-case.ts` a partir de `job.companyId`, e um
`createWhatsAppDriverFromChannelResolver((companyId) => channel)` ao lado do factory de canal único —
que os outros produtos, de um número só, continuam usando. Publicar isso alinha três produtos e não é
decisão de uma task de produto.

**Três decisões que ficaram no código:**

- **envelope que não abre é `retriable`, não `permanent`.** Chaveiro fora do ar é indisponibilidade
  de minutos, e `permanent` queimaria a notificação — notificação queimada não volta, porque a fila
  já a deu por resolvida;
- **o telefone é normalizado no gateway**, último ponto antes do fio: `+55 (16) 99999-1234` é a forma
  normal do cadastro, e mandá-lo cru faz a Graph API recusar com um erro que **parece de credencial**
  — o operador iria conferir o token quando o defeito estava no traço;
- **o driver é registrado sempre**, e não sob sondagem de boot. `bootstrap()` é síncrono, e mais: o
  fan-out cruza os canais disponíveis com a **preferência** do destinatário, então quem não pediu
  WhatsApp continua recebendo por e-mail sem o driver precisar sumir. Instalação sem canal responde
  `channel_not_configured` por entrega, e o chaveiro nem é chamado.

O contrato prova o caminho feliz (texto livre e template), a ausência, a **ambiguidade**, o envelope
ilegível e as duas classificações que vêm do pacote (`meta_131026` → destino inválido, erro sem
código → nova tentativa). A integração prova o que só o banco prova: canal **desligado** e canal
**sem token** são coisas diferentes na tela e a mesma coisa para o envio — sem isso, a instalação com
um canal ativo e um rascunho pela metade pareceria ambígua ao driver e **nenhuma** notificação sairia.

```
bun run --cwd apps/api-transportada test              # 3638 pass / 0 fail
bun run --cwd apps/api-transportada test:integration  # 181 pass / 0 fail
typecheck · lint · format:check                       # limpos
```

#### Buracos declarados

- **A empresa não chega ao driver** — patch do pacote descrito acima. Enquanto isso, instalação
  multi-CNPJ com dois canais **não envia WhatsApp**, por recusa explícita.
- **Nada dispara WhatsApp ainda**: não há template de canal `whatsapp` cadastrado nem preferência
  apontando para ele. Convite e recuperação de senha são a T005.
- **A credencial é aberta a cada envio** — uma chamada ao chaveiro por mensagem. Aceitável no volume
  de hoje; se virar gargalo, o cache é por `(companyId, version)`, nunca por tempo.
- **Sem tela** para cadastrar o canal, e **sem rate limit**, como registrado na T003.

### T005 — convite e recuperação de senha por WhatsApp (2026-08-29)

`DELIVERABLE_CHANNELS` já listava `'whatsapp'` desde a spec 026, e o gateway recusava tudo que não era
e-mail — o canal existia no banco e não existia no código. Agora entra pelo **mesmo trilho**:
`createInvitationChannelGateway` roteia por canal, e os dois consumidores (convite e recuperação)
usam o mesmo gateway, cada um com o seu template.

⚠️ **Aqui a empresa é conhecida, e é o que torna este caminho diferente do driver da T004.** O
envelope da mensagem carrega `companyId`, então a linha do canal é escolhida sem ambiguidade — o
`channel_ambiguous` da T004 **não existe neste trilho**. É a mesma credencial, selada pela API e
aberta aqui, e os dois caminhos divergem só em quem sabe de que empresa se trata.

**Este não é o driver da T004, e não deveria ser.** Lá quem envia é o módulo de notificação, com
template, preferência do destinatário e retry próprio; aqui é mensagem transacional do trilho de
identidade, que **não passa pelo módulo de notificação em canal nenhum** — nem no e-mail. Fazer o
convite atravessar o módulo para reusar o driver trocaria um caminho conhecido por dois.

⚠️ **O caminho de produção é o template aprovado, não o texto livre.** A Meta recusa mensagem livre
para quem não escreveu para o número nas últimas 24 horas — e **quem recebe um convite nunca
escreveu**. Por isso `WHATSAPP_INVITATION_TEMPLATE` e `WHATSAPP_PASSWORD_RESET_TEMPLATE` levam o nome
do template aprovado, com o código como único parâmetro do corpo; ausentes, o envio cai em texto
livre, que é o caminho **degradado** (cliente já em conversa, mock local). Foi por isso que
`channels.send` ganhou `code` ao lado de `body`: o corpo inteiro é a mensagem do e-mail, e o template
precisa do código sozinho.

**Três decisões que ficaram no código:**

- **canal sem driver lança, e não marca entregue.** O código continua válido e reenviável porque quem
  falhou foi o transporte — dar o convite por enviado sem ele ter saído é o defeito que ninguém
  descobre até o cliente ligar. É o mesmo arranjo que o e-mail já tinha;
- **o telefone é normalizado no último ponto antes do fio**, como no gateway da T004: o contato do
  cadastro é digitado por gente, e o traço faz a Graph API recusar com um erro que parece de
  credencial;
- **nada de código em log**, em nenhum nível: o corpo da mensagem _é_ o segredo, e o erro daqui nomeia
  a empresa, jamais o conteúdo (`security.md` §1).

⚠️ **Três cópias por valor novas**, todas com o mesmo motivo de sempre — as apps não importam código
uma da outra e quem faz migration é a API: o schema de `whatsapp_channels` (só as colunas que o envio
lê), o repositório e **o AAD do envelope**. O AAD é o que dói se divergir: quem **sela** é a API, na
rota de configuração, e quem **abre** é o worker, no envio; divergiu de um lado e o envelope não abre
do outro, e a falha aparece só no primeiro convite por WhatsApp. `test/whatsapp-code/aad-parity.contract.ts`
compara os dois arquivos-fonte.

O contrato prova a rota do canal, a recusa sem driver, a falha subindo para o retry, o e-mail intacto
ao lado, o envio por template com o código como parâmetro, o texto livre como degradação, a empresa
sem canal (com o chaveiro **não** chamado) e — o que quebra em silêncio — **a fiação**: o serviço de
entrega repassando empresa e código até o canal. Sem essa última, o gateway compila, o teste de rota
passa, e o envio falha na primeira mensagem.

```
bun run --cwd apps/worker-transportada test   # 768 pass / 0 fail
bun run --cwd apps/api-transportada test      # 3638 pass / 0 fail
typecheck · lint · format:check               # limpos
```

#### Buracos declarados

- **Sem template aprovado na Meta, o convite por WhatsApp não sai** para quem nunca escreveu — e é o
  caso normal. As duas variáveis existem e estão vazias no `.env.example`; aprovar os templates é
  trabalho de painel, do lado da Meta, e ninguém pode fazer por quem tem a conta.
- **Nenhuma empresa está com `activation_channel = 'whatsapp'`** — a coluna aceita, e não há tela que
  a mude. Trocar o canal hoje é `UPDATE` na mão.
- **Sem integração contra a Graph API de verdade**: o contrato dubla o `fetch`. Um mock local por
  `WHATSAPP_BASE_URL` é o caminho, e ele não existe no `compose.yaml`.
- **A `WhatsAppChannelNotConfiguredError` nomeia a empresa na mensagem** — identificador opaco, então
  está dentro da regra, mas é o tipo de campo que cresce sem querer.

### T006 — o módulo de conversa e o webhook assinado (2026-08-29)

A conversa passa a ter estado: `meta-whatsapp-module` instalado, migrations dele na cadeia de
`db:migrate`, e uma rota pública que só aceita corpo assinado pela Meta.

**A configuração se parte em duas, e a divisão não é arbitrária.** O `WHATSAPP_APP_SECRET` e o
`WHATSAPP_WEBHOOK_VERIFY_TOKEN` são do **aplicativo** da Meta — um app assina o webhook de _todos_ os
números que administra —, então são variáveis de ambiente. O token de acesso é do **número**, e
continua selado por empresa no banco, como a T001 o deixou. Tratar os três igual poria segredo de app
no banco por empresa (repetido e desincronizado) ou o token do número no `.env` (um só para toda a
instalação, matando o "um número por filial").

⚠️ **Fail-closed por ausência: sem os dois segredos a rota não é registrada** — mesmo espírito do
callback da NFS-e (ADR-0022). Publicar o endereço e conferir a assinatura "quando o segredo existir"
transformaria configuração faltando numa porta aberta, e a falha ficaria **invisível**: a Meta não
reclama de um webhook que responde 200 a tudo.

**A ordem dentro da rota é a decisão de segurança.** A assinatura é conferida **antes** de o corpo
virar dado; só depois dela o `phone_number_id` vira empresa. Descobrir o tenant a partir de corpo não
verificado deixaria um atacante escolher contra qual empresa a entrega forjada é contada.

**Quase tudo responde 200, e a exceção é a assinatura.** A Meta desativa webhook que responde erro —
número desconhecido, corpo sem número e evento que não sabemos ler saem `200`, porque um número de
outra WABA derrubaria a entrega de todos os outros junto. Corpo não assinado, esse é `403`: responder
`200` a ele ensinaria um atacante que o endereço aceita qualquer coisa.

**Uma instância do módulo por empresa**, porque ele recebe a credencial na construção. A chave do
cache carrega a `version` da linha — é isso que faz trocar o token no painel valer na entrega seguinte
sem restart e sem invalidação manual. ⚠️ O cache guarda o token **aberto em memória** enquanto o
processo viver; o alternativo seria abrir o envelope a cada entrega, e conversa é muito mais tráfego
que notificação.

⚠️ **O nonce anti-replay é a segunda exceção declarada ao tenant**, ao lado de
`fuel_price_references` e por motivo diferente: lá é dado público de mercado, aqui é uma decisão que
acontece **antes de haver tenant** — a chave sai da assinatura, e a assinatura é conferida antes de
sabermos a empresa. Ele vive em Postgres, não em memória: um cache por processo deixaria a mesma
entrega passar uma vez em cada réplica, que é o replay que ele existe para impedir. O `insert ... on
conflict` é o `SET NX` atômico que a porta pede, e chave vencida é **substituída** em vez de virar
bloqueio eterno — com janela de cinco minutos, um job de limpeza seria encanamento a mais.

O contrato cobre a rota que não sobe sem segredo, o corpo assinado chegando ao módulo com a empresa
certa, o **payload adulterado** recusado, a assinatura de outro segredo recusada, a ausência de
cabeçalho recusada, o número desconhecido respondendo 200 sem chegar ao módulo, o desafio de
verificação e o teto de taxa nas duas rotas. E o que a spec pede em `security.md` §1: **nada do que o
cliente escreveu aparece em log** — o teste varre o que foi registrado atrás do texto e do telefone.

A integração prova o que só o banco prova: dez reivindicações simultâneas da mesma chave e **uma**
vence.

```
make migration-test                                   # 90 pass / 0 fail
bun run --cwd apps/api-transportada test              # 3649 pass / 0 fail
bun run --cwd apps/api-transportada test:integration  # 184 pass / 0 fail
typecheck · lint · format:check                       # limpos
```

#### Buracos declarados

- **Ninguém lê a conversa ainda.** O módulo grava sessão e mensagem, e não há tela nem rota de
  leitura — isso é a T007, com o `ConversationsWorkspace`, e o papel do atendimento é a T008.
- **Sem `hooks`**: `onMessageReceived`, `onStatusUpdate` e os de conta não têm handler, então mensagem
  do cliente entra no transcript e **não vira estado nenhum** — agendamento e evento de entrega são a
  frente 3 (T009–T011).
- **Sem motor de fluxo ligado de fato**: `flowEngine` fica no padrão do módulo, e não há grafo
  publicado. O `fallbackMessage` e o handoff da `conversation-flow.md` §5 ainda não existem.
- **Sem janela de timestamp.** A spec pedia; o pacote publicado protege por nonce de cinco minutos e
  não expõe checagem de `timestamp`. Uma entrega capturada e reenviada **depois** da janela do nonce
  seria aceita. Fechar isso é ler `messages[].timestamp` do corpo já verificado — ou changeset no
  pacote, que é onde a regra deveria morar.
- **Sem mídia, sem transcrição e sem realtime**: `objectStorage`, `transcription` e `realtime` não são
  injetados. Nota de voz e imagem chegam como mensagem sem binário.
- **A versão publicada do pacote é anterior à do repositório de packages** — `runMetaWhatsAppMigrations`
  recebe a conexão direto em vez do `migrate` por injeção, ao contrário do `notification-module`. Não
  uniformizei: mudar isso é changeset no pacote.
