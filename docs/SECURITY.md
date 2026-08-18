# Achados de segurança

Achado não vive no histórico de conversa: entra aqui com data, dono e desfecho. Item resolvido não
some — muda para "Fechado" com a data e o que passou a valer.

## Abertos

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
