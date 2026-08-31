# Achados de segurança

Achado não vive no histórico de conversa: entra aqui com data, dono e desfecho. Item resolvido não
some — muda para "Fechado" com a data e o que passou a valer.

## Abertos

### 2026-08-31 — telefone e foto passam a viver no realm, ao lado do documento

O provedor passa a guardar a identificação completa da pessoa: além do `tax_id` que já estava em
claro, entram `phone` e `picture`. A foto vai como `data:` URI — o conteúdo, não um endereço: a URL
anterior apontava para a nossa rota autenticada, e nenhum consumidor do lado de lá conseguia buscá-la
(`<img src>` não manda `Authorization`), então o atributo existia sem servir para nada.

O que muda em exposição, e é decisão consciente:

- **Telefone em claro no realm.** Havia um contrato dizendo que o contato do convite não vazava para
  os atributos; ele foi reescrito. Quando o canal do convite é telefone, contato e telefone são o
  mesmo valor por construção — não há como guardar um e não o outro.
- **A imagem inteira no atributo**, até o teto de 256 KiB que a rota já impunha. Quem tem acesso de
  administração do realm passa a ver a foto sem passar pela nossa API, e portanto sem a trilha de
  auditoria que a nossa rota grava.
- **Nenhum dos três tem mapper de claim**, e isso é o que impede o pior: só `company_id` entra no
  token. Mapear `picture` poria centenas de kilobytes dentro de cada token emitido.
- **A senha continua fora**, e isso não se negocia — há contrato cobrando.

Um defeito que veio junto e foi corrigido: `updateAttributes` do Admin API **substitui o conjunto
inteiro**, e a edição de perfil mandava só `company_id` + `tax_id`. Gravar o CPF apagava a foto do
provedor. Era invisível enquanto ninguém lia o atributo; com a imagem morando lá, seria perda de
dado. Toda edição passa a escrever a ficha completa.

### 2026-08-31 — administrador define senha definitiva de outro usuário, sem limitador

`PUT /company-users/:id/password` (`users.manage`, escopo `company`) grava a senha do usuário no
Keycloak. O vínculo com a empresa do token é conferido antes de a rota tocar no provedor, o piso é
de 12 caracteres, a senha não passa pelo banco desta aplicação e a resposta é 204 sem eco do corpo.
A trilha (`company-user.password.set`) guarda ator, alvo e correlação, nunca o valor.

O que fica em aberto, e é decisão registrada e não esquecimento:

- **Sem rate limit**, como toda esta API — não existe limitador aqui. Uma conta com `users.manage`
  comprometida pode reescrever senha de todo mundo da empresa dela sem atrito nenhum.
- **A senha definitiva passa pela mão do administrador.** O caminho preferido continua sendo o link
  de redefinição, oferecido lado a lado no mesmo painel, e a opção temporária existe para forçar a
  troca no primeiro acesso. A senha definitiva ficou porque instalação com e-mail quebrado é caso
  real desta base, e sem ela a única saída era o provedor.
- **Não há notificação ao dono da conta** quando um terceiro troca a senha dela. Quem só olha a
  trilha descobre depois; quem não olha, não descobre.

### 2026-08-27 — o portal do contratante não tem limite de requisição, como o resto da API

**Onde:** `api-transportada`, módulo `contractor-portal` (`GET /client/me/deliveries`).

**O que é:** a rota exige sessão autenticada e recorta pelo vínculo da conta — não há enumeração de
documento a fazer, porque o documento nunca chega do cliente. O que fica em aberto é o mesmo buraco
já registrado para as rotas de recuperação de senha: **não existe limitador nesta API**, e agora há
uma conta legítima na mão de alguém de fora da transportadora.

**Risco:** um contratante (ou credencial dele, vazada) pode varrer a rota sem teto. O que ele lê é o
que já é dele — o custo é de disponibilidade, não de confidencialidade.

**Mitigação em vigor:** o recorte é por vínculo, com `company_id` nas duas chaves estrangeiras; o
payload é lista fechada, sem id interno; e o teto de leitura é cem linhas por chamada.

**Desfecho pendente:** limitador por usuário autenticado, junto com o das rotas anônimas de senha —
é uma decisão só, e é infraestrutura, não regra de domínio.

### 2026-08-26 — CPF do usuário fica em texto puro em `identity_user_profiles`

**Onde:** `api-transportada`, módulo `identity` (coluna `identity_user_profiles.tax_id`).

**O que é:** o `security.md §5` pede campo sensível em repouso — CPF entre eles — cifrado com
chave de aplicação. A coluna nova nasceu em texto puro, deliberadamente, porque o mesmo dado já
está assim em `fleet_drivers.tax_id`, com `check` de formato e unique por empresa. Cifrar só de um
lado teria dois custos concretos: a unicidade deixaria de ser verificável pelo banco (texto cifrado
com IV aleatório não colide mesmo quando o CPF é igual), e o casamento entre o convite e a ficha de
frota — que é a razão da coluna existir — passaria a exigir decifrar a tabela inteira a cada
convite. Também criaria um terceiro padrão de armazenamento para o mesmo documento no mesmo banco.

**Risco:** dump de banco ou backup vazado expõe CPF de todo usuário e de todo motorista. A
exposição não aumentou com esta coluna — `fleet_drivers` já a tinha —, mas o alcance cresceu:
agora pega também quem não é motorista.

**Mitigação em vigor:** a API nunca devolve o CPF por extenso; a listagem e a resposta do convite
saem mascaradas (`***09`), como o contato. Backup é cifrado antes de subir ao bucket, com a chave
fora dele.

**Desfecho pendente:** decidir de uma vez, para `fleet_drivers` e `identity_user_profiles` juntos,
entre (a) cifra determinística com chave de aplicação, que preserva unicidade e igualdade, ou (b)
aceitar o texto puro e registrar a exceção. Resolver só um dos dois lados não fecha nada.

**Dono:** a definir.

### 2026-08-25 — `POST /public/aggregate-applications` é anônima e sem limitador dedicado

**Onde:** `api-transportada`, módulo `fleet` (spec 053, T007).

**O que é:** a rota aceita candidatura de agregado sem autenticação, e a resposta é `202`
invariável de propósito — documento novo, reenvio ou documento já motorista respondem igual,
para não existir sonda de "este documento já existe". Isso fecha o oráculo de enumeração, mas não
substitui um limitador: sem teto, a rota é um canal de escrita (uma linha por chamada) acionável
por qualquer um. O mesmo item já registrado para recuperação de senha e para a landing pública
continua em aberto — falta o limitador de borda, mais duro aqui por escrever no banco a cada
chamada em vez de só ler.

**O que já limita o estrago:** o `CHECK` de documento (T005) recusa entrada fora do formato de
CPF/CNPJ antes de gravar, e o unique parcial por `(company_id, tax_id) where status = 'pending'`
faz reenvio update em vez de inserir linha nova — flood do mesmo documento não cresce a tabela.

**Origem:** spec 053, T007.

### 2026-08-25 — `GET /public/landing-settings` é anônima e sem limitador dedicado

**Onde:** `api-transportada`, módulo `landing` (spec 053, T004).

**O que é:** a rota responde sem autenticação e sem chave de tenant no path — ela sempre lê a
empresa provisionada da instalação (`PROVISION_COMPANY_ID`). Não há PII na resposta (marca,
contatos institucionais já públicos, endereço das unidades) e o corpo é idêntico para qualquer
chamador, então não é oráculo de nada. O que falta é o mesmo item já registrado abaixo para
recuperação de senha: um limitador de borda — aqui o risco é menor (raspagem de conteúdo público),
mas a rota soma à lista de anônimas sem teto.

**Origem:** spec 053, T004.

### 2026-08-26 — o worker passa a ter identidade de máquina, e ela alcança todas as empresas

**Onde:** `api-transportada`, caminho de autenticação; `worker-transportada`, credencial de cliente.

**O que é:** o worker vira um cliente do Keycloak com service account (ADR-0047), para acionar a
emissão automática de MDF-e que a spec 065 decidiu. Ele é reconhecido por papel em
`realm_access.roles`, pela mesma porta em que `platform-admin` já é.

**O que muda em risco, e é o motivo desta entrada:** o `§2` acima manda derivar o tenant do contexto
autenticado e nunca de campo livre do cliente. Um token de gente carrega `company_id` e fica **preso a
uma empresa**; um service account **não pode** — o worker processa CT-e de todas elas. Então a empresa
chega no pedido e continua sendo **validada contra a membership real do usuário do serviço**: a
autorização é idêntica à de gente, o que muda é o transporte.

O preço é concreto: **o token do serviço é cross-tenant**. Vazado, ele alcança toda empresa onde a
membership sintética existir — enquanto um token de gente alcança uma.

**As três guardas, e nenhuma é opcional:**

1. **Escopo de uma rota.** O serviço não recebe `mdfe.manage`, que também descarta manifesto: recebe
   uma permissão criada para isto, e o papel dele concede só ela.
2. **Segredo rotacionável**, em variável validada no boot, e a troca vale a partir do próximo token —
   rotacionar não pode exigir janela de emissão parada.
3. **Trilha com a identidade do serviço**, nunca "o sistema": é a linha que responde por que aquele
   manifesto saiu.

**O que falta:** **tudo.** Nesta data existe só a decisão registrada — o caminho de autenticação, o
papel, a permissão e a credencial do worker **não foram implementados**. Enquanto não forem, o MDF-e
automático só sai se alguém chamar a rota na mão, e o painel de prontidão é quem avisa que dá.

**Origem:** spec 065, ADR-0047.

### 2026-08-26 — a posição passa a ser permitida à própria origem, e a coordenada tem prazo

**Onde:** `frontend-transportada`, `server.ts` (mapa `SECURITY_HEADERS`); `api-transportada`,
`trip_stop_events`.

**O que é:** o cabeçalho passa a `camera=(self), geolocation=(self), microphone=()`. O motorista
confirma a entrega no celular e a coordenada carimba **onde ele estava quando confirmou** — é o que
separa "entreguei" de "entreguei lá" (ADR-0045 §3). Abrir capacidade de dispositivo é decisão que se
audita, e por isso ela é registrada aqui em vez de ser uma linha mudada em silêncio.

**O que continua fechado:** `microphone=()`, para todo mundo. E `(self)` não é `*`: nenhum `iframe` de
terceiro herda a posição, e a CSP declara `frame-src 'none'` desde a ADR-0037.

**O que a decisão proíbe, e é a parte que importa:** a captura é `getCurrentPosition` **uma vez por
confirmação**, nunca `watchPosition`. A coordenada mora no evento de entrega e **não existe tabela de
posição do motorista** — não há "onde ele está agora", só "onde estava quando confirmou". Recusar a
permissão **não bloqueia a entrega**: ela é gravada com `location: null`, porque produto que exige
coordenada é produto que o motorista contorna anotando no papel.

**Retenção:** 90 dias. Depois disso o expurgo agendado apaga `latitude`, `longitude` e
`accuracy_meters` **preservando o evento** — a viagem continua auditável, a localização da pessoa não
fica. Dado de localização de pessoa identificada é dado pessoal na LGPD (art. 5º, I), e reter "por
garantia" transforma comprovante em passivo.

**O que falta:** nada em aberto. O contrato de cabeçalhos guarda os dois sentidos (falha se
`geolocation` voltar a `()` e falha se `microphone` deixar de ser `()`), e o expurgo tem teste de
integração com relógio injetado — retenção escrita e não implementada é retenção que não existe.

**Origem:** spec 057, T001/T005/T012.

### 2026-08-24 — a câmera passa a ser permitida à própria origem no `Permissions-Policy`

**Onde:** `frontend-transportada`, `server.ts` (mapa `SECURITY_HEADERS`).

**O que é:** o cabeçalho era `camera=(), geolocation=(), microphone=()`. `camera=()` nega a **própria**
origem: `getUserMedia` falha antes de qualquer diálogo do navegador. Passa a `camera=(self)`, para o
separador ler o QR da nota pela câmera do celular na tela de viagem (spec 055). Abrir capacidade de
dispositivo é decisão que se audita, e por isso ela é registrada aqui em vez de ser uma linha mudada
em silêncio.

**O que continua fechado:** `geolocation=()` e `microphone=()` — a tela não pede posição nem áudio, e
nada nesta mudança os toca. `(self)` não é `*`: nenhum `iframe` de terceiro herda a câmera, e a CSP
já declara `frame-src 'none'` desde a ADR-0037, então não há moldura de terceiro dentro da nossa tela
para herdar coisa alguma. O navegador continua pedindo consentimento ao usuário a cada origem — o
cabeçalho remove o bloqueio, não a permissão.

**O que falta:** nada em aberto. O contrato
`frontend-transportada/test/shared/security-headers.contract.ts` guarda os dois sentidos: falha se
`camera` voltar a `()` e falha se `geolocation` ou `microphone` deixarem de ser `()` — a carona de
capacidade de dispositivo é o risco real de seis meses adiante, não a câmera que alguém pediu.

**Origem:** spec 055, T003.

### 2026-08-21 — a rota de CEP chama provedor externo sem limitador de requisição

**Onde:** `api-transportada`, `addresses/presentation/postal-code.routes.ts` e
`addresses/infrastructure/postal-code.gateway.ts` (`GET /postal-codes/{cep}`).

**O que é:** a rota é autenticada (`addresses.read`, escopo `company`) e, quando as nossas tabelas não
sabem o CEP, chama a BrasilAPI e, se ela falhar, o ViaCEP. **Esta API não tem limitador de requisição
nenhum**, então um cliente em laço vira uma chamada externa por requisição, com a nossa infraestrutura
como origem em vez do navegador do operador — o que é exatamente o que a ADR-0037 apontou como preço
do proxy ("pediria um limitador de taxa que esta API não tem"). É o §3 do baseline, que manda limitar
"qualquer rota que dispare custo externo".

**O que já limita o estrago:** a rota exige token com `addresses.read` (fora de `finance`, `viewer`,
`driver` e `aggregate`) e resolve o tenant antes de tocar no domínio, então não há caminho anônimo; só
chega ao provedor **o que a base não souber**, e a base tende a saber cada vez mais; o campo da tela é
debounced e cancelado por `AbortSignal` a cada tecla; o `AbortSignal` e o timeout do gateway impedem
que uma resposta pendurada acumule requisição; e a resposta sai com `cache-control: no-store`, sem
nada logado do endereço.

**O que falta:** um limitador na borda — por empresa e por usuário autenticado, mais duro nesta rota
por ela disparar custo externo. É o **mesmo limitador ausente** dos dois achados abaixo
(recuperação de senha e o de 2026-08-13); não são três problemas, é um, cobrado em três lugares. Um
cache curto de CEP por empresa reduziria a chamada externa, mas não substitui o teto.

**Decisão:** **ADR-0040**, item 5 — a rota sobe assim, com o achado datado. O saldo é positivo (o
volume de transferência ao provedor cai) e o preço está escrito em vez de descoberto depois.

**Origem:** spec 050, T7.2.

### 2026-08-20 — endereço do motorista sai do navegador para quatro terceiros, sem CSP para conter

**Onde:** `frontend-transportada`, `fleet/shared/driverAddress.service.ts` e
`fleet/hooks/useDriverAddressLookup.hook.ts` (formulário de motorista e cadastro rápido).

**O que é** (como estava quando foi achado; o estado de hoje está em "Decisão", abaixo)**:** o
preenchimento de endereço consultava quatro provedores públicos direto do navegador do
operador — `brasilapi.com.br` e `viacep.com.br` pelo CEP, `photon.komoot.io` e
`nominatim.openstreetmap.org` pela busca textual — e o mapa é um `iframe` de
`openstreetmap.org/export/embed.html` com a coordenada na URL. O que viaja é **dado pessoal de
pessoa física** (CEP e endereço residencial do motorista, digitados na tela), e viaja **na query
string**, que é exatamente o que o §8 do baseline proíbe. São quatro operadores sem contrato, sem
DPA e fora do inventário de tratamento — e o `Referer` entrega de quebra a origem da instalação do
cliente.

Um quinto destino sai do mesmo formulário e **não** carrega dado pessoal: a lista de municípios do
IBGE (`brasilapi.com.br/api/ibge/municipios/v1/{UF}`, em `fleet/shared/municipality.service.ts`)
manda só a sigla do estado. Ele não é achado de LGPD; entra aqui porque a CSP que faltar precisa
enumerá-lo também, senão publicar a diretiva quebra o select de cidade.

Não há **CSP nenhuma no repositório** (`rg 'connect-src|Content-Security-Policy'` não devolve nada),
o que é violação autônoma do §3 e o que faz este achado ser sem teto: nada na borda declara para
onde o bundle pode falar, então qualquer destino novo — nosso ou de dependência comprometida — sai
sem obstáculo.

A política de uso do Nominatim ainda pede no máximo 1 req/s e um `User-Agent`/`Referer`
identificável. `User-Agent` é cabeçalho proibido ao `fetch` do navegador: **não temos como cumprir
essa metade** de dentro da página.

**O que já limita o estrago:** a busca é debounced (400ms), sai só a partir de cinco caracteres, é
cancelada por `AbortSignal` a cada tecla e pede no máximo seis resultados; nenhuma resposta é logada;
e a chamada parte do navegador do operador, não do servidor, então o endereço não passa pela nossa
infraestrutura a caminho do terceiro.

**Decisão (2026-08-20):** a **ADR-0037** decidiu, status `aceito`, e está **executada**. A leitura
campo por campo mostrou que não é um trilho, são quatro com exposição muito diferente: a consulta de
CEP manda **oito dígitos** e nada mais, enquanto quem mandava o endereço residencial inteiro era
`locateAddress` — e ela existe **para o mapa**, não para preencher o formulário, que já está
preenchido quando ela roda. Então: saiu o mapa (com o `iframe`, a coordenada e a geocodificação de
confirmação), saiu o Nominatim (a política pede `User-Agent`, cabeçalho proibido ao `fetch` — termo
que não temos como cumprir de dentro da página), ficaram a consulta de CEP com os dois provedores, o
Photon e a lista do IBGE. **Não
há proxy:** hoje a requisição parte do navegador do operador e o endereço não passa pela nossa
infraestrutura; o proxy inverteria isso, criando superfície de PII onde não existe nenhuma, e pediria
um limitador que esta API não tem.

**Executado (spec 046, T007-A):** saíram o mapa, o `iframe`, a coordenada, a geocodificação de
confirmação e o provedor Nominatim. Sobraram três destinos com dado pessoal — `brasilapi.com.br` e
`viacep.com.br` recebendo **oito dígitos de CEP**, e `photon.komoot.io` recebendo o **termo
digitado** — mais a lista do IBGE, que leva só a sigla do estado. O endereço residencial completo
**não sai mais do navegador**. O contrato-guarda
`apps/frontend-transportada/test/fleet/address-map-removed.contract.ts` falha se algum dos símbolos
ou dos dois destinos voltar ao bundle.

**Executado (spec 046, T008):** a CSP existe e é servida em toda resposta. Ela é composta no
**build** — `VITE_API_URL` e `VITE_KEYCLOAK_URL` são inlinadas no bundle e não existem no contêiner
que serve o `dist` —, sai por `dist/content-security-policy.txt` e o `server.ts` **não sobe** sem o
arquivo (`FRONTEND_MISSING_CONTENT_SECURITY_POLICY`), porque publicar sem cabeçalho é a única falha
que não quebra nada visível. `connect-src` enumera os três destinos mais a API e o Keycloak;
`frame-src`, `frame-ancestors` e `object-src` são `'none'`; `script-src 'self'` sem `unsafe-eval`. A
folga de `'unsafe-inline'` existe **só** em `style-src`, pelo atributo `style` da camada flutuante que
nonce não cobre (`style-src-attr` é ignorado pelo Safari < 15.4 e quebraria todo select no iPhone).
O contrato `test/shared/content-security-policy.contract.ts` varre `src/**` por origem `https://` e
falha se alguma não estiver na diretiva ou declarada como nunca buscada — destino novo em qualquer
módulo cai ali.

**Executado (spec 050, T6.1–T6.4):** o CEP **não sai mais do navegador**. Ele passa por
`GET /postal-codes/{cep}` (`addresses.read`, escopo `company`), que consulta primeiro as nossas quatro
tabelas de endereço — `nfe_addresses`, `fleet_drivers`, `company_fiscal_profiles` e os dois CEPs de
`mdfe_manifests`, cinco consultas em corrida, `company_id` no `where` de cada uma — e só chama a
BrasilAPI e o ViaCEP quando a base não sabe. Todo acerto local é uma transferência a terceiro que não
acontece, e é a primeira redução deste achado que é **medida** em vez de declarada.
`viacep.com.br` saiu do `connect-src`; `brasilapi.com.br` ficou pelo cadastro por CNPJ e pela lista de
municípios do IBGE, que continuam saindo do navegador. **ADR-0040** — que reverte, para o CEP e só
para ele, o "não há proxy" do item 5 da ADR-0037: o proxy volta porque o navegador não lê as nossas
tabelas, não como remédio de privacidade.

**O que falta:** inventariar no registro de tratamento o que sobrou — o termo digitado indo ao Photon,
e o CEP indo aos dois provedores **quando a base não souber**. O achado **encolheu três vezes**, e não
fechou: a borda declara para onde o bundle pode falar e o volume caiu, mas o caminho ao provedor sem
contrato continua existindo, agora com a nossa infraestrutura como origem (ver o achado de
2026-08-21, no topo).

**Origem:** auditoria de lacunas do cadastro de motorista (spec de endereço, ainda sem
`spec.md`/`evidence.md`).

### 2026-08-20 — data de nascimento do motorista em claro, contra o §5

**Onde:** `fleet_drivers.birth_date` (`api-transportada/src/database/fleet.schema.ts`).

**O que é:** o §5 do baseline manda criptografar campo sensível em repouso e nomeia data de
nascimento entre eles, com chave de aplicação separada da chave do banco. A coluna é `date` em
claro. `license_number` (CNH, onze dígitos), o endereço residencial e o trio do RG
(`identity_document`, `identity_document_issuer`, `identity_document_state`, acrescentados em
2026-08-23) estão na mesma situação, e o `tax_id` do motorista — CPF — já estava, desde antes desta
feature.

**O que já limita o estrago:** a tabela é por empresa, toda query filtra `company_id`, o banco não
tem exposição pública e o acesso é só pela rede interna; nenhum destes campos vai para log, e
nenhum aparece em nome de objeto no bucket. O backup é criptografado antes do upload.

**Decisão (2026-08-20):** a **ADR-0039** decidiu, status `aceito`, e **não está executada**. A leitura
coluna por coluna mostrou que a tabela não tem uma resposta só, e que o campo mais sensível é o único
que não dá para proteger: `birth_date`, `license_number`, o endereço e o telefone vão para um envelope
A256GCM único, com AAD por motorista e índice cego com HMAC para a CNH continuar única por empresa —
justamente porque **não têm leitor**, e por isso é o momento mais barato que vai existir. O adendo de
2026-08-23 põe o trio do RG no mesmo envelope, pelo mesmo motivo, sem índice cego: o RG não é único no
produto.
`tax_id` fica em claro por decisão: `mdfe-payload.builder.ts:72` já o lê, e o mesmo CPF está em claro
em `mdfe_issuance_payloads.payload`, comprometido por `payload_sha256`, e no XML que o produto
preserva — criptografá-lo protegeria o motorista que nunca entrou em manifesto e cobraria a unicidade,
o CHECK e o caminho de outra app. `name` (busca por trecho) e `license_expires_at` (a data que o aviso
de CNH vai varrer) ficam em claro por serem o que se consulta.

**O que a ADR não promete:** o chaveiro vive no ambiente da própria API. Isto defende **leitura do
banco sem a aplicação** — credencial somente-leitura vazada, Adminer ou Metabase mal configurado,
`pg_dump` indevido, backup restaurado em outro lugar —, que é a ameaça que o §5 descreve ao pedir
chave separada da do banco. Não defende aplicação comprometida.

**O que falta:** executar. Migração de expansão, backfill que sela pela aplicação, índice cego e
contração — que é **destrutiva** e exige aprovação humana, com `rollback.sql` que devolve as colunas e
não os valores. É spec própria. Até ela existir, as colunas seguem em claro: o achado saiu de "sem
decisão" para "decidido e pendente", e não fechou.

**Lacuna que este achado revelou e não resolve:** **não existe rotação de chave neste repositório**,
para nenhum envelope — nem para as credenciais de NFS-e. O `keyId` deixa a porta aberta; re-selar
linha não está escrito.

**Origem:** auditoria de lacunas do cadastro de motorista.

### 2026-08-17 — postback de NFS-e sem assinatura, autenticado só pelo token do caminho

**Onde:** `POST /public/nfse-callbacks/{token}` (`api-transportada`, módulo `nfse-callbacks`).

**O que é:** a Nota RP **não assina o postback**. A coleção oficial da v2 mostra os quatro exemplos
de retorno saindo com um único cabeçalho, `Content-Type: application/json` — não há
`X-Hub-Signature-256`, `X-Signature` nem equivalente para verificar. Isso quebra a regra do §3 do
baseline ("todo webhook público valida assinatura HMAC com `rawBody`"), e não por escolha nossa: não
há o que validar. A única prova de origem é o token opaco no caminho, e ele viaja na URL — logo
aparece em log de proxy e de CDN, que é justamente onde token não deveria estar.

**O que já limita o estrago:** o postback é **gatilho, não fonte da verdade**. O corpo não é lido,
não é validado e não é logado; quem chama a rota só consegue **antecipar** uma reconciliação que o
cron `nfse.status.pull` faria de qualquer jeito, e o estado da nota vem depois disso da consulta
autenticada ao provedor. A resposta é 204 invariável — token válido, inventado, empresa inexistente
ou banco fora do ar respondem igual, então a rota não é oráculo de existência. O token é opaco, por
empresa, guardado só como digest sha256, comparado com `timingSafeEqual` e sem saída antecipada do
laço. E a rota **só existe** onde `NFSE_CALLBACK_BASE_URL` está configurada.

**O que falta:** um limitador na borda (a API não tem nenhum — ver o achado abaixo, é o mesmo
buraco), e reavaliar se o provedor passa a assinar. Rotação do token de callback por empresa
continua sendo o remédio se um endereço vazar.

**Origem:** spec 040, T011.

### 2026-08-13 — rotas anônimas de recuperação de senha sem rate limit

**Onde:** `POST /password-resets` e `POST /password-resets/confirm` (`api-transportada`, módulo
`identity`).

**O que é:** as duas rotas atendem sem autenticação nenhuma, e esta API **não tem limitador para
registrá-las** — `rg 'rateLimit|rate-limit|RATE_LIMIT' apps/api-transportada/src` não devolve nada.
Sem teto, a primeira rota é um canal de envio de e-mail acionável por qualquer um, e a segunda
aceita tentativa ilimitada de adivinhar o código.

**O que já limita o estrago:** o código é de uso único, expira em 15 minutos e vem de fonte
criptográfica; a primeira rota responde 204 para login existente e inexistente, então não serve de
oráculo de enumeração; e nenhuma das duas escreve `username`, endereço ou código em log.

**O que falta:** um limitador na borda da API — por IP e por login alvo, mais duro nestas duas
rotas — e o gate de tentativas por pedido, que hoje só existe pela expiração.

**Origem:** spec 033, T006. A task pedia "registrar no limitador"; não havia onde.

### 2026-08-25 — staging passa a conter os dados pessoais de produção

**Onde:** `deploy/staging-refresh/`, serviço Railway com `cronSchedule` semanal.

**O que é:** staging aponta para o ambiente de homologação da SEFAZ, e homologação não devolve nota
real — a distribuição roda e traz nada, deixando staging sem massa para testar. A decisão foi
espelhar a base de produção inteira em staging uma vez por semana, **sem anonimização**, porque o
objetivo declarado é replicar o ambiente.

A consequência é que staging passa a guardar os mesmos dados pessoais de terceiros que produção:
CPF/CNPJ, nome, endereço e telefone de destinatário em `nfe_participants`/`nfe_addresses`. Sob a
LGPD isso é tratamento com finalidade diferente da coleta, e o dado não é da transportadora: é dos
clientes dos clientes dela.

**O que ficou de fora, por decisão:** os XML assinados **não** são copiados — copiá-los exigiria uma
credencial de leitura do bucket fiscal de produção morando dentro de staging, e isso é acesso
permanente, não o retrato semanal que foi decidido. Também não atravessam: nenhum dado de emissão
(CT-e, MDF-e, NFS-e, faturamento), a numeração fiscal, as credenciais de provedor de NFS-e, e o
`secret_envelope` de `digital_certificates` — o certificado A1 que assina documento fiscal de
verdade, que num restore cru iria junto e é risco maior que qualquer PII.

**O que já limita o estrago:** a réplica roda **dentro do Railway**, como o ciclo de backup — o dump descriptografado e os XML não atravessam runner hospedado de terceiro, que era o desenho inicial e foi descartado por isso. O banco de produção nunca é acessado — a origem é o backup cifrado
que o ciclo diário já produz, e o bucket é copiado com credencial de leitura. O Keycloak de
produção **não** atravessa: staging mantém os próprios usuários e realm, então login de produção
não passa a valer lá. A guarda do primeiro passo recusa qualquer alvo cujo host seja o de produção,
antes de baixar qualquer coisa.

**O que falta:** tratar staging com o mesmo controle de acesso de produção, que é o preço da
decisão — quem entra em staging passa a ver PII real. Concretamente: revisar quem tem credencial do
banco e do bucket de staging, e definir retenção (hoje o refresh sobrescreve, mas nada expira).
Reavaliar a anonimização se algum dia staging for aberto a alguém de fora do time.

**Origem:** pedido de operação, 2026-08-25. O risco foi levantado e a cópia idêntica foi decidida
conscientemente.

## CPF em claro no Keycloak, para casar a pessoa dos dois lados

**Data:** 2026-08-29 · **Decidido conscientemente**

A reconciliação entre os usuários da empresa e o realm precisa saber quando duas contas são a mesma
pessoa. A pessoa tem **um documento e vários e-mails**, então o documento é a chave que funciona — e
o realm não guardava documento nenhum: o produto só escrevia `company_id`.

A partir de agora o CPF é gravado **em claro** no atributo `tax_id` do usuário do Keycloak, no
convite, na edição de perfil e num backfill de quem já existe. Isso espalha PII para um segundo
sistema: o CPF passa a existir no banco do Keycloak e nos backups dele, fora do alcance das nossas
regras de retenção.

**A alternativa que foi oferecida e recusada:** índice cego com HMAC, o mesmo padrão que a ADR-0039
escolheu para a CNH do motorista. Ele casaria a pessoa igual — compara-se hash com hash — sem que o
documento saísse da nossa base. O custo era uma chave nova para gerenciar e um valor ilegível no
console do Keycloak. A escolha por valor em claro foi do dono do produto, com o risco declarado.

**O que limita o estrago hoje:** o atributo não é lido por ninguém além da reconciliação, e ela
mascara o documento na resposta (`***09`) — o valor cru é usado só para casar, dentro do servidor.
O backfill não escreve documento vazio, e a escrita leva `company_id` junto porque o Admin API
substitui o conjunto inteiro de atributos.

**O que falta:** decidir a retenção do atributo no realm (hoje nada o expira), e reavaliar o índice
cego se o Keycloak passar a ser acessado por mais gente do que hoje.

## Fechados

_Nenhum ainda._
