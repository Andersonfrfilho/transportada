# ADR-0079 — Quem recebeu viaja com o comprovante sem derrubar a foto, e o motorista vê o contato do destinatário

- **Data:** 2026-09-25
- **Estado:** proposta. Aguarda o aceite formal, na T7.2 da spec 193.
  - A Parte A é decisão do usuário, com o desenho da spec 193 revisado depois da crítica.
  - Na Parte B, a forma (§4) e os canais (§5) foram respondidos pelo usuário em 2026-09-25.
  - A semântica de `required` no motorista (A3) é decisão da spec, revisável.
- **Spec:** 193
- **Complementa:** a ADR-0057 do comprovante configurável (arquivo
  `0057-o-comprovante-e-configuravel-e-o-documento-entra-com-envelope.md`), com um quinto campo.
- **Revisa:**
  - a ADR-0067 §5, emenda de 2026-09-18, no trecho "o motorista continua sem essa saída": o nome
    passa a ir na foto do motorista;
  - a **spec 079, § "o contato, e o que a tela revela"** (`spec.md:203-222`): contato oculto por
    padrão, revelação gravada em `audit_logs` e número do motorista nunca exposto. A revisão vale
    só para o app do motorista.
    O contato continua oculto e auditado. Muda que o número do motorista passa a ser exposto ao
    cliente, por aceite do usuário (Parte B, §4 e §5).
- **Segue:** a ADR-0070 §1, pela qual o formulário nunca faz o motorista perder prova.
- **Fecha:** a "ADR do contato do destinatário" que a spec 079 exigia antes da T022.

## Parte A — Quem recebeu

### Contexto

1. O formulário do comprovante só aparece depois da entrega confirmada (ADR-0070). O dado de quem
   recebeu já vive no comprovante (`receiver_name`).
2. O servidor só grava o nome se `kind='signature'` ou `channel='office'`. Por isso o motorista que
   só fotografa o canhoto perde o nome que digitou.
3. O `attach` do app retorna antes de enfileirar quando falta campo obrigatório, e o recorte já foi
   descartado nesse ponto. **Um campo que bloqueie descarta a foto.**
4. O anexo sobe pela fila offline. Um 4xx vira `rejectionCause`, o item para de drenar e é
   descartado em 7 dias. A foto obrigatória que não chega tira ponto da nota (ADR-0070 §5).

### Decisão

1. **Quem recebeu é coluna do comprovante.**
   - `received_by` é `VARCHAR(16)`, com CHECK em `RECEIVED_BY_OPTIONS`: `recipient`, `spouse`,
     `child`, `parent`, `sibling`, `other_relative`, `neighbor`, `doorman`, `employee`, `other`.
   - `received_by_detail` é `VARCHAR(120)`.
   - Os dois valem para `photo` e `signature`, nunca para `cargo`.
   - O painel lê a relação da mesma linha que deu o nome.
2. **A foto do motorista carrega nome, relação e detalhe.** O CHECK do nome vira
   `kind <> 'cargo' or length(receiver_name) = 0`. A migration verifica antes que não há linha
   `cargo` com nome. O documento continua só na assinatura.
3. **Nada do formulário recusa nem descarta o anexo do motorista.**
   - A forma inválida é normalizada para nulo e a resposta é 201.
   - O modo `off` descarta o dado.
   - O modo `required` vira pendência visível, não recusa.
   - A falta de detalhe em `other`/`other_relative` vira aviso.
   - No **escritório**, que envia de forma síncrona, a forma inválida responde 400 e `required`
     responde 422 `TRIP_DELIVERY_PROOF_RECEIVED_BY_REQUIRED`.
   - No app, a foto entra na fila antes de qualquer validação (pré-requisito P0 da spec 193, regra
     comum com a spec 194).
4. **O dado alcança o comprovante depois da foto.** Com o item ainda na fila, a edição o atualiza
   pela `attachmentKey`. Com o item já enviado, vai um `PATCH .../proof/receiver`, idempotente e
   enfileirado como evento.
5. **Portal.** Não recebe o campo. Se um dia mostrar comprovante, a relação pode ir e o detalhe
   nunca (ADR-0050 §4).

## Parte B — O contato do destinatário, para o motorista

### Contexto

O telefone do destinatário já está na base (`<enderDest><fone>` → `nfe_addresses.phone`, spec 013).
O escritório já o vê no detalhe da viagem desde a 079 P2. A T022 da 079 pedia esta ADR antes de
seguir.

O e-mail vem em cerca de 98,5% das NF-e medidas (`<dest><email>`). Ele era descartado pelo pacote
fiscal, e a correção é o PR `adatechnology-packages#105`, ainda aberto
(`docs/ai-context/api-transportada.md:228-247`).

### Base legal

O destinatário normalmente **não é parte** do contrato de transporte. O contrato é entre a
transportadora e o contratante do frete. Por isso a execução de contrato (art. 7º, V) só se aplica
quando o destinatário é o próprio contratante. Para o caso geral, a base é o **legítimo interesse**
(art. 7º, IX), com o teste do art. 10:

- **Finalidade legítima e concreta:** concluir a entrega da mercadoria que o próprio titular
  espera.
- **Necessidade:** só o telefone e o e-mail, só da nota em curso.
- **Expectativa do titular:** quem espera uma entrega espera ser chamado pelo entregador.
- **Transparência:** o dado foi declarado pelo emitente na nota para identificar e contatar o
  destinatário da operação.

A finalidade é compatível com a coleta (art. 6º, I). Qualquer uso fora da entrega em curso seria
finalidade nova e fica proibido por esta ADR. Quando o destinatário é pessoa jurídica, o contato
costuma ser corporativo, mas a regra acima vale igual.

### Decisão

1. **Minimização.**
   - Vai só telefone e e-mail. O nome já existe.
   - Vai só das notas da viagem do próprio motorista, pelo recorte de `/me`.
   - Vai só enquanto a nota está pendente e a viagem está aberta. Depois disso sai `null` do
     snapshot.
2. **Snapshot offline.** O contato vai no snapshot, que já tem chave `SHA-256(sub)`, validade de
   24 h e descarte no "Sair", na troca de conta e na conclusão. Ligar funciona sem dados. Não há
   outro cache.
3. **Nunca** vai para log, telemetria, notificação, texto de WhatsApp, lista ou relatório.
4. **Forma: atrás de "Ver contato", com auditoria** (decisão do usuário, 2026-09-25). O card
   mostra "Ver contato". Com um toque, o contato aparece, lido do snapshot, e funciona sem rede. O
   evento de revelação vai pela fila offline (`contactReveal`) para `audit_logs`, com ator, viagem,
   nota e horário. **Segue a spec 079**: o contato fica oculto por padrão e a revelação é auditada.
5. **Canais: Ligar e WhatsApp, dois botões** (decisão do usuário, 2026-09-25).
   - O `wa.me` só aparece com celular de 11 dígitos e não leva texto pré-preenchido.
   - **Risco aceito pelo usuário, sabendo dele:** o WhatsApp abre no aplicativo pessoal do motorista
     e **entrega o número dele ao cliente**. Ligar também, salvo se o motorista ocultar o número. Isso
     revisa a proteção do número do motorista da 079 (`spec.md:211-213`).
   - Os links `tel:`, `wa.me` e `mailto:` deixam o número e o e-mail do cliente no histórico de
     chamadas, no WhatsApp e no e-mail do aparelho do motorista, **sem prazo e fora do nosso
     controle**.
   - Os dois riscos ficam no `docs/SECURITY.md` como aceitos pelo usuário em 2026-09-25. Uma
     mitigação futura (telefone da empresa, número oculto, ponte de chamada) é decisão nova.
6. **Escritório.** Vê o telefone como já vê, e o e-mail quando existir, sem mudar a permissão.
7. **E-mail.** Entra por merge e publicação do #105, com bump na API e no worker
   (`drizzle-nfe-import-consumer.repository.ts`, cópia do schema), coluna em `nfe_participants` e
   backfill por `nfe-party-contact-backfill.service.ts`, que já relê os XMLs.

## Consequências

- O motorista que só fotografa o canhoto passa a ter o nome gravado, e a foto nunca mais se perde
  por causa de formulário.
- `required` é garantia de servidor só no escritório. No motorista, é pendência visível.
- Nasce uma rota nova (`PATCH .../proof/receiver`) e um tipo novo de evento na fila
  (`proofReceiver`).
- O contato do destinatário passa a existir no aparelho do motorista, dentro dos limites acima.
- Reversão: o rollback da migration aborta se houver dado. **O caminho de reversão é só de código**:
  as colunas ficam e deixam de ser escritas ou lidas. O `rollback.sql` fica para ambiente sem dado.
