# ADR 0030 — Recuperação de senha por código de uso único, no nosso trilho

- Status: aceito
- Data: 2026-08-12
- Decisores: mantenedor do projeto e revisão Opus

## Contexto

Quem esquece a senha hoje não tem saída dentro do produto: depende de um administrador da empresa
reenviar o convite, o que só funciona para quem ainda não ativou a conta, ou de alguém com acesso ao
Keycloak. A spec 026 excluiu explicitamente o assunto — _"Autoatendimento de cadastro (self-signup) e
recuperação de senha esquecida"_ — e a Fase D acabou de entregar a peça que faltava: o código de
ativação sai de verdade pelo canal configurado na empresa (`company_fiscal_profiles.activation_channel`,
T015), sobre o trilho `invitation-delivery.v1`.

Existem dois caminhos possíveis, e eles não se somam.

1. **Delegar ao Keycloak.** O realm tem `Forgot password` nativo: o próprio Keycloak envia o e-mail e
   hospeda a tela de redefinição. Exige SMTP configurado **no realm**, uma segunda configuração de
   remetente além da que a aplicação já tem, e joga o usuário para fora do domínio do produto no meio
   do fluxo. Pior: o canal vira e-mail para toda empresa, contradizendo a escolha por empresa que
   acabou de ser entregue, e o texto da mensagem passa a viver no realm, fora do repositório.
2. **Repetir o desenho do convite.** Código de uso único, hash no banco, envelope selado para o
   worker entregar, rota anônima que troca código por senha nova via Admin API. Tudo isso já existe,
   testado, em `identity/domain/invitation.policy.ts` e `activate-invitation.use-case.ts`.

## Decisão

1. **A recuperação é nossa, não do realm.** O `Forgot password` do Keycloak permanece desligado. O
   produto já tem remetente, canal por empresa e trilho de entrega; ligar um segundo caminho de
   e-mail criaria duas fontes de verdade para a mesma mensagem.
2. **Tabela própria, `password_reset_requests`, não reuso de `user_invitations`.** O convite carrega
   `status` com `superseded`/`revoked`, FK composta para a membership e a semântica de _primeira_
   senha; a recuperação é para quem **já** ativou. Reusar a tabela deixaria um pedido de recuperação
   capaz de ressuscitar convite revogado, que é exatamente o que não pode acontecer. As colunas
   espelham o convite (`code_hash`, `sealed_code`, `attempt_count`, `expires_at`, `consumed_at`) e o
   hash é único no banco inteiro pelo mesmo motivo: a rota que o consome não tem tenant no contexto.
3. **A janela é mais curta que a do convite.** TTL de 15 minutos (convite: dias) e no máximo 5
   tentativas. Um convite espera a pessoa organizar o primeiro acesso; uma recuperação é pedida com a
   tela de login aberta.
4. **A resposta é invariável.** `POST /password-resets` responde 204 sempre — usuário inexistente,
   desabilitado, sem membership ativa ou sem endereço de contato produzem a mesma resposta e o mesmo
   tempo de resposta aproximado. A confirmação também não distingue código errado de expirado de já
   usado, herdando `InvitationActivationDecision`, cujo tipo não tem campo capaz de vazar o motivo.
5. **Recuperar senha não reabilita conta.** O caminho de ativação chama `setEnabled` porque o convite
   é o momento em que a conta nasce habilitada; aqui só se chama `setPassword({temporary: false})`.
   Usuário desabilitado que acerta o código continua sem entrar — desabilitar é decisão
   administrativa, e o esquecimento de senha não a revoga.
6. **A entrega usa o canal da empresa, pelo trilho `password-reset-delivery.v1`.** Trilha nova com
   main/retry/dead, como toda outra, e não um segundo tipo de mensagem no trilho do convite: a
   mensagem tem outro texto, outro TTL e outra política de retentativa, e misturá-las tiraria a
   possibilidade de pausar uma sem pausar a outra. O AAD do envelope é
   `transportada:password-reset:v1:${companyId}:${requestId}` e é copiado palavra por palavra entre
   API e worker, como o do convite.
7. **A empresa é resolvida no servidor.** O pedido leva só o `username`. Quem tem membership em mais
   de uma empresa gera um pedido por empresa ativa — o canal de entrega é da empresa, e escolher uma
   delas no cliente exigiria dizer ao anônimo em quais empresas aquele login existe.

## Alternativas rejeitadas

**Ligar o `Forgot password` do realm.** Barato de configurar, caro de manter: SMTP duplicado, texto
fora do repositório, canal fixo em e-mail e o usuário saindo do domínio do produto. O `realm/`
versionado deixaria de descrever o comportamento real assim que alguém ajustasse o template pelo
painel.

**Link mágico em vez de código.** Um link autentica sozinho e vive no histórico do navegador, no
proxy corporativo e no pré-visualizador de mensagem do WhatsApp. O código de 16 caracteres hex já é o
vocabulário do produto e funciona igual nos três canais.

**Reusar `user_invitations` com um `kind`.** Economizaria uma tabela e custaria o invariante: toda
query de convite passaria a precisar lembrar do filtro por tipo, e o esquecimento silencioso é
justamente o modo de falha que a FK composta de membership existe para eliminar.

## Consequências

- Uma tabela nova, uma migration aditiva com rollback ao lado, e a trilha
  `password-reset-delivery.v1` na topologia do worker.
- O contrato de isolamento continua valendo: o repositório recebe `companyId` e filtra por ele em
  tudo, exceto na busca por hash, que é global por construção e por isso tem unique global.
- A tela de login ganha "Esqueci minha senha", reusando a forma da tela de ativação.
- Auditoria: pedido e consumo gravam trilha com ator (o próprio usuário), IP e timestamp, sem PII no
  log — o `username` não vai para log, o `requestId` vai.
