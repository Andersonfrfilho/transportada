# 033 — Recuperação de senha self-service

## Problema

Quem esquece a senha fica de fora do produto até alguém resolver por ele. Não existe caminho na tela
de login: o administrador da empresa só consegue ajudar reenviando o convite, e reenvio só existe
para quem **ainda não ativou** a conta. Para quem já ativou, a única saída hoje é o console do
Keycloak — quer dizer, uma pessoa com acesso ao provedor de identidade da instalação.

A spec 026 excluiu o assunto de propósito (_"Autoatendimento de cadastro (self-signup) e recuperação
de senha esquecida"_) porque faltava a peça de baixo: o código não saía de lugar nenhum. A Fase D
entregou essa peça — o código de ativação sai pelo canal configurado na empresa
(`company_fiscal_profiles.activation_channel`), sobre `invitation-delivery.v1`. O que falta agora é
só apontar a mesma máquina para o outro momento.

## Objetivo

1. A tela de login tem **"Esqueci minha senha"** e ela funciona sem intervenção de ninguém.
2. O código chega pelo **mesmo canal que a empresa já configurou** para a ativação.
3. Nenhuma resposta da API diz se um login existe, está desabilitado ou não tem contato.
4. Redefinir senha **não** reabilita conta desabilitada.

## Decisões

Detalhamento e alternativas rejeitadas em **ADR-0030**.

**Recuperação é nossa, não do realm.** O `Forgot password` nativo do Keycloak continua desligado.
Ligá-lo exigiria SMTP configurado no realm além do que a aplicação já tem, fixaria o canal em e-mail
para toda empresa e tiraria o texto da mensagem do repositório.

**Tabela própria: `password_reset_requests`.** O convite tem `superseded`/`revoked`, FK composta de
membership e a semântica de _primeira_ senha. Reusá-lo deixaria um pedido de recuperação capaz de
ressuscitar convite revogado.

**Janela curta.** TTL de 15 minutos e no máximo 5 tentativas — quem pede recuperação está com a tela
de login aberta, ao contrário de quem recebe um convite.

**Resposta invariável.** Pedido e confirmação respondem 204 sempre. A decisão de domínio herda o
formato de `InvitationActivationDecision`, cujo tipo de recusa não tem campo capaz de vazar o motivo.

**Redefinir não reabilita.** Só `setPassword({ temporary: false })`; nunca `setEnabled`.

**A empresa sai do servidor.** O pedido leva só o `username`; quem tem membership ativa em mais de
uma empresa gera um pedido por empresa.

## Comportamento

### Pedir

`POST /password-resets` (anônima, `defineAnonymousRoute`), corpo `{ username }`.

1. Resolve as memberships **ativas** daquele login. Nenhuma → 204, sem efeito.
2. Para cada empresa: gera código (mesma máquina do convite — `generateInvitationCode`,
   `hashInvitationCode`), grava `password_reset_requests` com `code_hash`, `sealed_code`
   (`@adatechnology/secret-envelope`, AAD `transportada:password-reset:v1:${companyId}:${requestId}`)
   e `expires_at = now + 15min`, e uma linha de outbox — **na mesma transação**.
3. Pedido pendente e não expirado do mesmo usuário na mesma empresa é substituído: o anterior é
   marcado consumido e não vale mais.
4. Responde 204.

O `OutboxRelayLoop` publica em `password-reset-delivery.v1`; o consumidor lê o canal da empresa,
abre o envelope e entrega pelo mesmo driver da ativação.

### Confirmar

`POST /password-resets/confirm` (anônima), corpo `{ code, password }`.

1. `hashInvitationCode(code)` → busca por hash (única no banco inteiro; a rota não tem tenant).
2. Recusa — sem distinguir motivo — se: não achou, `consumed_at` preenchido, expirou, ou
   `attempt_count >= 5`. Tentativa errada sobre pedido vivo incrementa `attempt_count`.
3. Aceitou: `setPassword({ temporary: false })` no provedor e `consumed_at = now`. Nada de
   `setEnabled`.
4. Responde 204.

### Limites e trilha

- Rate limit por `username` e por IP nas duas rotas, mais duro que o global (`security.md` §3).
- Trilha de auditoria no pedido e no consumo: ator, IP, timestamp, `requestId`. **Nunca** o
  `username`, o endereço de contato nem o código — em nenhum nível de log.

### Frontend

Link "Esqueci minha senha" na tela de login; tela em dois passos com a forma da tela de ativação
(pedir → digitar código e senha nova), esqueleto de carregamento, texto acentuado em `*.locale.json`.

## Fora de escopo

- Autocadastro (self-signup).
- Troca de senha por quem já está logado — isso é o Account Console do Keycloak.
- Segundo fator e política de complexidade de senha (ambos vivem no realm).
- Link mágico que autentica sozinho.

## Critérios de aceite

1. `POST /password-resets` responde 204 para login inexistente, desabilitado, sem membership e
   válido — sem diferença observável no corpo, no status ou nos cabeçalhos.
2. Login com membership ativa em duas empresas gera dois pedidos e duas linhas de outbox.
3. Pedido novo invalida o pendente anterior da mesma empresa.
4. Código correto redefine a senha e marca `consumed_at`; o mesmo código na segunda vez é recusado.
5. Código expirado, errado ou de pedido consumido são recusados com resposta idêntica entre si.
6. Cinco tentativas erradas travam o pedido; a sexta é recusada mesmo com o código certo.
7. Usuário desabilitado que acerta o código tem a senha trocada e **continua desabilitado**.
8. O consumidor entrega pelo canal de `company_fiscal_profiles.activation_channel`; empresa sem
   perfil fiscal entrega por e-mail.
9. O AAD do envelope é idêntico entre API e worker — contrato de paridade, como o da NFS-e.
10. Nenhum log de nenhum nível contém `username`, endereço de contato ou código.
11. Isolamento: `test/identity-schema/tenant-safety.contract.ts` cobre a tabela nova; toda query,
    exceto a busca por hash, filtra por `companyId`.
12. `make check` e `make migration-test` verdes.
