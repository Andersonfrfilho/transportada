# Achados de segurança

Achado não vive no histórico de conversa: entra aqui com data, dono e desfecho. Item resolvido não
some — muda para "Fechado" com a data e o que passou a valer.

## Abertos

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

**O que falta:** inventariar no registro de tratamento o que sobrou — o termo digitado indo ao Photon
e o CEP indo aos dois provedores. O achado **encolheu duas vezes**, e não fechou: a borda agora
declara para onde o bundle pode falar, mas continua sendo transferência de dado pessoal a provedor
sem contrato e fora do inventário.

**Origem:** auditoria de lacunas do cadastro de motorista (spec de endereço, ainda sem
`spec.md`/`evidence.md`).

### 2026-08-20 — data de nascimento do motorista em claro, contra o §5

**Onde:** `fleet_drivers.birth_date` (`api-transportada/src/database/fleet.schema.ts`).

**O que é:** o §5 do baseline manda criptografar campo sensível em repouso e nomeia data de
nascimento entre eles, com chave de aplicação separada da chave do banco. A coluna é `date` em
claro. `license_number` (CNH, onze dígitos) e o endereço residencial estão na mesma situação, e o
`tax_id` do motorista — CPF — já estava, desde antes desta feature.

**O que já limita o estrago:** a tabela é por empresa, toda query filtra `company_id`, o banco não
tem exposição pública e o acesso é só pela rede interna; nenhum destes campos vai para log, e
nenhum aparece em nome de objeto no bucket. O backup é criptografado antes do upload.

**O que falta:** a decisão consciente que o §5 exige — criptografar as colunas de pessoa física do
motorista (`birth_date`, `license_number`, `tax_id`, endereço) com chave de aplicação, ou registrar
por ADR por que a instalação dedicada e a rede fechada bastam neste produto. Hoje não há nem uma nem
outra: o campo nasceu em claro por omissão, e é isso que este item corrige ao ficar escrito.

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

## Fechados

_Nenhum ainda._
