# Achados de segurança

Achado não vive no histórico de conversa: entra aqui com data, dono e desfecho. Item resolvido não
some — muda para "Fechado" com a data e o que passou a valer.

## Abertos

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
