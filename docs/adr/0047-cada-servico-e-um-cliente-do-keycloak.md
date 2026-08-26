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

| Alternativa                                   | Por que não                                                                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Segredo compartilhado com header próprio      | Caminho de autenticação escrito por nós, ao lado de um Keycloak que já faz isso melhor.                  |
| Um cliente do Keycloak por empresa            | Provisionamento por tenant, e o worker teria de descobrir qual cliente usar a cada mensagem.             |
| Worker escreve direto no banco                | Duplica a montagem do manifesto — veículo, condutores, itens, municípios, totais. Regra fiscal duplicada diverge. |
| Mover o domínio de manifesto para `packages/` | A regra do monorepo fala de **provider** compartilhado, não de domínio; e move superfície demais.        |
| Deixar manual                                 | O automático é o caminho normal desta operação (065 D2b); manual é o contorno.                           |
