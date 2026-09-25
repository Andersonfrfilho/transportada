# ADR-0076 — Primeiro acesso por autoatendimento, sem oráculo

- **Status:** proposta (passa a aceita na T0.1 da spec 191)
- **Data:** 2026-09-25
- **Decisores:**
  - usuário, em 2026-09-25: link separado, reenvio público com resposta neutra, anti-robô só se houver
    abuso, segurança obrigatória na tela e correção da armadilha e da suspensão;
  - orquestrador, na revisão do `critic`: suspender não revoga; o reenvio entrega o mesmo código
    enquanto válido;
  - o desenho é desta ADR.
- **Spec:** `specs/191-primeiro-acesso-e-a-porta-do-login/`
- **Aplica:** ADR-0030 §4 (resposta invariável) e §5 (redefinir não reabilita); ADR-0021 (a empresa
  sai do servidor, nunca do anônimo).
- **Incorpora:** o desenho do branch nunca mesclado `fix/client-ip-trusted-proxy` (`51cd186c6`). A ADR
  daquele branch saiu com o número 0065 e colidiu com
  `0065-a-caixa-se-mede-com-cartao-e-nunca-grava-sozinha.md`. O código portado passa a citar esta ADR,
  §6.

## Contexto

Quem foi convidado e perde o código depende do administrador para receber outro. O "Esqueci minha
senha" leva o convidado a definir uma senha numa conta que continua desabilitada.

A ativação não confere o vínculo: reabilita no Keycloak quem foi suspenso. Suspender também não
aparece como tal na lista enquanto houver convite pendente.

As quatro rotas anônimas de identidade não têm limite compartilhado entre réplicas, e o IP usado pelo
limitador é escolhido pelo cliente. O contador de 5 tentativas por convite não conta chute errado,
porque a busca é pelo hash do próprio chute. O realm não liga a proteção contra força bruta.

Os detalhes medidos, com arquivo e linha, estão em `spec.md § Problema`.

## Decisão

1. **Reenvio público com resposta invariável.**
   - `POST /invitation-resends` recebe o identificador que a pessoa lembra e o resolve no servidor,
     pelo mesmo caminho do `login-hints`.
   - A resposta é sempre a mesma: status 204, corpo vazio e cabeçalhos iguais, exceto
     `x-correlation-id` e `Date`.
   - Só entrega para identidade ativa, com membership ativa e convite mais recente `pending`, e só ao
     contato cadastrado, pelo canal da empresa.
2. **O piso de tempo iguala os caminhos, inclusive o de erro.**
   - A resposta sai em `max(trabalho, piso + variação aleatória)`.
   - O piso fica acima do p99 medido do caminho que reemite, com margem de pelo menos 30%.
   - Rejeitado: **responder antes e trabalhar depois**. O pedido se perde se o processo cair, o erro
     sai do escopo da requisição e fica uma promessa solta.
   - Rejeitado: **fila com o identificador**. Grava PII em repouso só para esconder tempo.
3. **Limite em dois estágios e em duas chaves, ambos compartilhados no Postgres.**
   - **Estágio 1:** um balde em memória por réplica, com o mesmo teto, recusa sem tocar no banco. Uma
     rajada de uma origem só não vira escrita no Postgres.
   - **Estágio 2:** o que passa pelo estágio 1 consome `rate_limit_windows`. É isso que faz o teto
     valer somado entre réplicas.
   - **Chave por IP**, em todas as rotas, antes do `parse`.
   - **Chave por alvo**, só no reenvio e na recuperação, depois do `parse` e do desafio.
   - Ambas as chaves são HMAC-SHA256, com chave própria e separação de domínio por escopo. A tabela não
     guarda IP nem identificador em claro.
   - A chave de alvo é o **texto digitado**, não o usuário resolvido. Assim, o 429 sai igual para quem
     existe e para quem não existe.
   - **O `login-hints` não tem chave por alvo.** Ela daria a um terceiro o poder de trancar a primeira
     etapa do login de qualquer pessoa, bastando saber o e-mail dela.
     - Risco residual: uma varredura distribuída por muitos IPs contra o oráculo de valor do
       `login-hints` (§ Consequências) só é limitada pelo teto por IP.
     - O remédio é o desafio (§10), se o critério de abuso disparar.
   - **Nas rotas que consomem código não há chave por alvo.** Uma chave pelo hash do chute não protege
     nada, e o contador por convite não conta chute errado. O que as protege é a entropia do código
     (64 bits, de `randomBytes(8)`) somada ao teto por IP.
4. **O reenvio entrega o mesmo código enquanto ele for válido.**
   - O `sealed_code` existe justamente para o worker poder reentregar, e o worker já entrega qualquer
     convite `pending` que tenha envelope.
   - Código novo, com o anterior virando `superseded`, só quando o anterior expirou, esgotou as
     tentativas ou não tem envelope. Vale para o reenvio administrativo e para o público.
   - Com isso, reenviar deixa de ser meio de invalidar o código de alguém (negação de serviço por
     `superseded`).
   - Sobram dois limites no autoatendimento, ambos contados nas linhas de outbox com
     `actor_user_id = user_id`:
     - um intervalo curto contra spam de e-mail: 2 min por convite;
     - um teto diário de 5 por membership.
   - Os convites e reenvios do administrador não contam para esses limites, e os limites não os barram.
5. **As telas públicas são copiadas por valor nas três apps, e o tema aponta para a origem de quem
   pediu.** Rejeitado: o tema apontar sempre para o painel.
   - O PWA instalado do motorista sai da janela `standalone` ao navegar para outra origem.
   - O portal é app separada por segurança (ADR-0050). Mandar o contratante ao painel expõe a ele a
     superfície do escritório.
   - O "voltar ao login" precisa voltar ao mesmo `client_id`.
   - O tema já resolve a origem pelo `redirect_uri` e pelo `client_data` (specs 033 e 190).
   - "Nenhuma app importa código de outra" proíbe o import, não a cópia. O `loginHintClient` já é
     copiado assim.
   - Contrato em cada app fixa caminho, corpo e resposta.
   - O rótulo é "Ativar minha conta", para não colidir com `/primeiro-acesso`, o assistente do
     primeiro administrador.
6. **O IP do cliente vem do salto conhecido**, pelo desenho incorporado de `51cd186c6`, medido em
   2026-09-14.
   - `CLIENT_IP_SOURCE` tem três valores:
     - `x-real-ip`, o padrão, porque o edge do Railway sobrescreve esse cabeçalho (medido);
     - `cf-connecting-ip`, só com a Cloudflare obrigatória;
     - `x-forwarded-for`, contando `TRUSTED_PROXY_HOPS` a partir do fim da cadeia.
   - Valor ausente ou que não é IP cai num balde só, `unknown`. O erro vai para o lado de limitar
     demais.
   - O resolvedor configurado é injetado em todos os pontos que gravam IP em trilha ou chaveiam
     limite.
7. **O convidado no "Esqueci minha senha" recebe o convite de novo, em silêncio.**
   - Alvo com convite `pending` não gera pedido de redefinição: segue pelo serviço de reenvio (§1 e
     §4), e a resposta continua 204.
   - A confirmação recusa esse alvo, por defesa em profundidade.
   - O §5 da ADR-0030 continua valendo.
8. **Suspender não revoga o convite. A ativação e o reenvio olham o vínculo.**
   - O status derivado prioriza a membership `disabled`: o suspenso aparece como suspenso, mesmo com
     convite pendente.
   - A ativação exige membership e identidade `active` antes de `setEnabled(true)`.
   - O reenvio administrativo recusa suspenso com 409.
   - Rejeitado: revogar na suspensão. Reativar exigiria reenviar à mão, e a trava na ativação já fecha
     o buraco sem uma escrita a mais na suspensão. O status `revoked` continua sem uso.
   - Risco aceito: a corrida em que a ativação passa pela checagem e a suspensão acontece antes do
     `setEnabled(true)`. A janela é de milissegundos e depende de ação do administrador.
9. **Remover vínculo apaga o histórico de convite e de recuperação daquela membership, com trilha.**
   - Condição: só se a medição (T0.2) confirmar que as FKs `RESTRICT` de `user_invitations` e
     `password_reset_requests` bloqueiam a remoção hoje.
   - Apaga todos os convites (`pending`, `accepted`, `superseded`) e os pedidos da membership, na
     mesma transação do `DELETE`.
   - Antes, grava `company-user.membership-removed` com o `accepted_at` e as contagens.
   - Rejeitado: responder 409 ("vínculo com histórico: suspenda"). Tornaria impossível remover qualquer
     pessoa que já foi convidada.
10. **Força bruta no realm, temporária e mascarada.**
    - `bruteForceProtected` ligado, com espera progressiva até 15 min.
    - Sem bloqueio permanente, que daria a um terceiro o poder de trancar qualquer conta.
    - Toda mensagem de bloqueio diz "Usuário ou senha inválidos.".
    - O realm existente recebe os campos pelo `keycloak-reconcile.sh`, só com os campos que o
      `realm.json` declara.
11. **Anti-robô pronto e desligado.**
    - O Turnstile fica atrás de `SELF_SERVICE_CHALLENGE_ENABLED=false`.
    - Ligado, roda depois do teto por IP e antes do consumo por alvo, para que token inválido não gaste
      o balde de ninguém.
    - A CSP dos fronts só inclui a Cloudflare quando há chave pública.
    - Ligar depende de decisão humana, pelo critério escrito no `docs/SECURITY.md`.
    - No motorista, ligar exige commit (a chave pública é literal `VITE_*`), e a chave do widget
      precisa listar os hostnames das três apps.
    - Rejeitado: ligar já. É atrito para todo convidado sem abuso medido, e põe uma dependência
      externa no caminho do primeiro acesso.

## Alternativas rejeitadas

- **"Forgot password" nativo do Keycloak para o convidado.** Mesma rejeição da ADR-0030, e não resolve
  o `enabled=false`.
- **Dizer ao convidado que o convite expirou.** Seria o próprio oráculo.
- **Limite só por IP no reenvio.** Não segura um ataque distribuído contra um único alvo.
- **Identificador ou IP em claro na chave do limitador.** Transformaria `rate_limit_windows` numa
  lista de PII, guardada por até 24 h.

## Consequências

- **Chave nova obrigatória, `RATE_LIMIT_SUBJECT_HMAC_KEY`.** Staging e produção precisam dela **antes**
  do primeiro push, ou a API não sobe. Criá-la antes é inofensivo: sem o código, a chave não é lida.
- **`docs/SECURITY.md`:**
  - 2026-09-18 (`:304-326`) passa a fechado;
  - L4 (`:463-478`) passa a parcialmente fechado, na parte de identidade;
  - 2026-08-13 (`:1273-1291`) **continua aberto**: a recuperação ganha teto por IP, mas o contador por
    pedido segue sem contar chute errado.
- **Continua aberto o oráculo de valor do `login-hints`**, que devolve o `username` canônico quando
  acha e o texto digitado quando não acha (`login-identifier.policy.ts:83-93`). Vai para spec própria
  e fica registrado como achado.
- **O link do e-mail do convite continua levando ao painel para todos os papéis.** Mudar isso é
  follow-up.
- **Três cópias das telas públicas, e das molduras, para manter em paridade.**
