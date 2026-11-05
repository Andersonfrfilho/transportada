# ADR 0047 — Cada serviço é um cliente do Keycloak, e o token de máquina é cross-tenant por natureza

- Status: aceito
- Data: 2026-08-26
- Decisores: mantenedor do projeto e revisão Opus
- Nasce da spec 065 (o gatilho automático do MDF-e precisa que o worker chame a API)
- Cumpre o que o `security.md` §2 descreve e não existia

## Contexto

A spec 065 decidiu que o MDF-e se emite sozinho quando o último CT-e que a viagem espera autoriza. A
autorização acontece no **worker**; a criação do manifesto é regra fiscal que vive na **API**. As duas
apps não importam código uma da outra.

O caminho escolhido foi o worker chamar uma rota da API — e a rota existe. O que não existia, e só
apareceu quando fui ligá-la, é **como o worker se autentica**:

- A API só aceita **JWT do Keycloak** com claim `company_id` e uma identidade externa ativa com
  membership. Não há caminho de máquina.
- O worker não tem URL da API nem credencial.
- O padrão que a casa usa hoje para "worker age em nome de uma empresa" é **outro**: a coleta de NF-e
  escreve direto no banco com um ator sintético (`…006`), que tem membership por empresa.

## Decisão

### 1. Cada serviço é um cliente do Keycloak, com service account

Nada de segredo compartilhado inventado por nós. O worker vira um cliente com `client_credentials`, e
o token dele é verificado pelo mesmo verificador que verifica o de gente — mesma chave, mesmo emissor,
mesma expiração. Um caminho de autenticação a menos para revisar é um caminho a menos para errar.

### 2. O service account é reconhecido por papel, como o `platform-admin` já é

A API já lê `realm_access.roles` para reconhecer `platform-admin`. O serviço entra pela mesma porta,
com papel próprio. Nenhuma estrutura nova de reconhecimento.

### 3. A empresa vem do recurso, e é **validada contra a membership do serviço**

Aqui está o ponto que precisa estar escrito, porque ele dobra uma regra:

> `security.md` §2 manda derivar o tenant do contexto autenticado, **nunca** de um campo livre do
> cliente. Um token de gente carrega `company_id` e fica preso a uma empresa. **Um service account
> não pode**: o worker processa CT-e de todas as empresas, e um token por empresa exigiria
> provisionar um cliente do Keycloak por tenant.

Então, para o serviço, a empresa chega no pedido — e **continua sendo validada contra a membership
real do usuário do serviço**, exatamente como a de gente. A autorização é idêntica; o que muda é o
transporte.

O que **de fato** muda em risco, e é o preço: o token do serviço é **cross-tenant**. Um token de gente
vazado alcança uma empresa; o do serviço alcança todas onde existir a membership sintética. Daí as
três guardas abaixo não serem opcionais.

### 4. Escopo enumerado, e ele é de uma rota

O serviço não recebe `mdfe.manage` — que também descarta manifesto. Ele recebe **uma permissão criada
para isto**, e o papel dele concede só ela. Um serviço que pode tudo o que um operador pode é um
operador com senha que ninguém troca.

### 5. O segredo é rotacionável, e rotacionar não derruba emissão

Segredo de cliente vive em variável de ambiente validada no boot, e trocar não pode exigir janela: o
worker pega token novo na expiração do atual, então a troca vale a partir do próximo token.

### 6. A trilha grava o serviço, não "o sistema"

Toda ação do serviço vai para `audit_logs` com a identidade dele. "O sistema emitiu" é a linha que não
responde nada quando alguém pergunta por que aquele manifesto saiu.

## Consequências

- O gatilho automático da 065 passa a existir de verdade, em vez de depender de alguém clicar.
- O n8n, que o `security.md` §2 cita junto, entra pelo mesmo caminho quando chegar.
- **O que se paga:** um token que alcança todas as empresas. É mitigado por escopo de uma rota,
  rotação e trilha — e é o motivo de esta ADR existir em vez de a mudança entrar calada.

## Alternativas descartadas

| Alternativa                                   | Por que não                                                                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Segredo compartilhado com header próprio      | Caminho de autenticação escrito por nós, ao lado de um Keycloak que já faz isso melhor.                           |
| Um cliente do Keycloak por empresa            | Provisionamento por tenant, e o worker teria de descobrir qual cliente usar a cada mensagem.                      |
| Worker escreve direto no banco                | Duplica a montagem do manifesto — veículo, condutores, itens, municípios, totais. Regra fiscal duplicada diverge. |
| Mover o domínio de manifesto para `packages/` | A regra do monorepo fala de **provider** compartilhado, não de domínio; e move superfície demais.                 |
| Deixar manual                                 | O automático é o caminho normal desta operação (065 D2b); manual é o contorno.                                    |

## Emenda 2026-11-05 — o verificador recusava o token do serviço antes de o caminho dele existir

**O que se achou** (staging, 05/11/2026): `keycloak-jwt.gateway.ts` configurava o verificador com
`requiredClaims: ['company_id']`. O §3 desta ADR diz que o token do serviço **não** carrega empresa — e
`AuthenticationService` já tinha o caminho para isso —, mas o verificador recusava o token antes, com 401.
Nenhuma chamada worker→API passou desde a 065: o MDF-e automático nunca emitiu (2437 CT-e autorizados e 0
MDF-e em 60 dias), a revisão automática do canhoto nunca gravou e a foto da CNH (spec 295) não tinha como
funcionar. O dublê do contrato de autenticação devolvia o token já verificado, então o teste nunca passou
pelo verificador real.

**A regra que passa a valer** (é a do §2 e §3, sem afrouxar nada):

- **Todo token:** assinatura RS256 com `kid` do JWKS do realm, emissor, `aud=transportada-api`, `exp` e
  `sub` — no verificador (`@adatechnology/keycloak-jwt`), sem exceção para serviço.
- **`company_id`** sai do verificador e fica num lugar só, `AuthenticationService`: obrigatório (UUID) para
  todo token **sem** o papel de realm exato `transportada-service`. Gente sem a claim continua 401.
- **Service account** = papel de realm `transportada-service` (exato). A empresa vem **só** do cabeçalho
  `x-company-id` — a claim, se vier, é ignorada — e precisa casar com uma membership ativa do usuário
  sintético do serviço (`TenantContextService.resolveCompany`); sem cabeçalho ou sem membership, 403.
- O serviço não passa por rota de membership (`/me/...`, política `membership`): 403
  (`AuthorizationService`, spec 144 T005b).
- Contrato com tokens **assinados de verdade** passando pelo verificador real:
  `apps/api-transportada/test/service-token.contract.test.ts`.

**O MDF-e automático ganhou interruptor, desligado** (decisão do dono): o crachá do worker serve também ao
canhoto e à baixa do WhatsApp, então consertar a autenticação ligaria a emissão fiscal sozinha. O worker só
monta o gatilho com `MDFE_AUTO_ISSUE_ENABLED=true` (padrão `false`; `true` sem as quatro variáveis do crachá
derruba o boot). Desligado, o boot registra `mdfe_auto_issue_disabled` uma vez, sem dado de empresa.
Ligar é decisão fiscal, pedida ao dono.

**Para as chamadas de serviço funcionarem num ambiente** (passo manual no Keycloak, por ambiente):

1. No realm do ambiente, em **Clients → `transportada-worker` → Client scopes → dedicated → Add mapper → By
   configuration → Audience**: nome `transportada-api-audience`, _Included Client Audience_
   `transportada-api`, _Add to access token_ ligado, _Add to ID token_ desligado. Repetir em
   `transportada-worker-cnh-picture` se ainda não existir (staging já tem, desde 05/11/2026; o
   `deploy/keycloak/realm.json` recebe o do CNH pelo commit `55682ed4d`, e precisa do mesmo bloco no
   `transportada-worker`).
2. Conferir que o usuário `service-account-<client>` tem o papel de realm `transportada-service`.
3. Conferir que o usuário sintético do serviço tem membership ativa, com o papel de serviço (`automation`,
   `cnh-picture-service`), **em cada empresa** em que ele deve agir — e em nenhuma outra.
4. Pedir um token (`client_credentials`) e conferir, decodificando sem imprimir o segredo, que `aud`
   contém `transportada-api` e `realm_access.roles` contém `transportada-service`.
5. Só depois disso, e com aprovação do dono, `MDFE_AUTO_ISSUE_ENABLED=true` no worker.
