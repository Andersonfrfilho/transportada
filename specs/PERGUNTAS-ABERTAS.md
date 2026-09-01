# Perguntas abertas — specs 056 a 060

Quinze dúvidas, agrupadas por urgência. Cada uma traz **minha recomendação** — onde você concordar,
basta dizer; onde discordar, a resposta entra na spec e a dúvida some.

**As três da 056 estão respondidas: o trabalho pode começar.** As doze restantes só precisam de
resposta quando a spec correspondente entrar na fila — e nenhuma delas toca a fundação da 056.

---

## ✅ Respondidas — a 056 está desbloqueada

### 1. Entrega parcial → **ocorrência, sem estado novo** (056 D7)

Raro na operação. A nota vai a `delivered` e a divergência de volumes vira ocorrência tipada com
foto (057 D6). O custo de inverter isso depois está mapeado na D7.

### 2. Nota `returned` com CT-e → **o CT-e fica de pé, e fica visível** (056 D8)

Nenhum efeito fiscal automático. Nasce a lista "retornadas com CT-e ativo" e uma ação explícita de
cancelamento, sempre humana — pelo mesmo caminho de índice que a 059 constrói.

### 3. Redespacho → **existe, e vira ação com dono** (056 D9)

Endereço de entrega sobrescrito por menu explícito, com **quem solicitou** (texto livre),
quem executou, motivo e histórico. A parada passa a nascer onde a mercadoria vai. Bloqueado após
`dispatched`.

## ⏳ Ainda sem resposta — 3 antigas + 11 novas

### 9. Encerramento do MDF-e _(059)_

`close` já existe em `MDFE_ATTEMPT_KINDS`. Quando a viagem vai a `completed`, o encerramento deve ser
automático? Manifesto não encerrado é pendência na SEFAZ e **trava a emissão do próximo**.

> **Recomendação: automático, e como P1 da 059.** Diferente da emissão (irreversível, por isso
> opt-in), o encerramento é obrigação que só causa dano quando **não** acontece.

### 11. MDF-e manual antes de `dispatched` _(059)_

Exigir `dispatched` também na emissão manual, ou permitir em `draft`/`route_planned`?

> **Recomendação: exigir.** `dispatched` significa "a carga está fechada", não "o caminhão já saiu do
> portão". Se a prática é emitir antes, o ajuste é despachar antes.

### 12. Aprovação do contratante _(060)_ → **respondida pela sua decisão do item 15**

Você decidiu que vai existir portal do cliente. Com ele, aprovar **dentro** do produto deixa de ser
caro — vira mais uma tela num app que já vai nascer. Ficou escrito assim na **063 D4**: o contratante
aprova linha a linha, com motivo, e a trilha registra o ator externo.

Recusa por linha e não por lote, porque é assim que a divergência acontece: ele aceita 36 de 38 e
questiona duas. Aprovação em bloco empurra a conversa para fora do sistema, que é o que o portal
existe para evitar.

> **Só confirme se concorda**, porque isso inverte minha recomendação anterior.

### 13. Calendário de feriados _(060)_

Nacional sai de biblioteca. **Municipal é onde dói** — a cidade fecha e o roteiro não sabe.

> **Recomendação: nacional agora, municipal depois.** A exceção por cliente já cobre o pontual.
>
> **A pergunta que decide: quantos municípios distintos vocês atendem por semana?**

---

## ✅ Respondidas nesta rodada

| #   | Resposta                                                                                                                                                                                     | Onde ficou              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 4   | Assinatura na tela do PWA (e no app), **obrigatoriedade por configuração**. Sem CPF do recebedor.                                                                                            | 057 D4                  |
| 5   | Retenção de 90 dias mantida.                                                                                                                                                                 | 057 D3                  |
| 6   | Agregado vê a mesma tela.                                                                                                                                                                    | 057 D1                  |
| 7   | **WhatsApp é para agora** — SDK próprio, UI no design da transportada, categoria própria. Envs a definir, não bloqueante.                                                                    | vira spec nova          |
| 8   | Janela de 3 meses, com contagem de ocorrências e comparação acima/abaixo da média.                                                                                                           | 058 D6                  |
| 10  | Gatilho é NF-e + CT-e; `freight_calculations` não manifesta. MDF-e sempre disponível para conferência. **E: a viagem passa a fechar a conta** (frete dos CT-e, pagamento a agregado, lucro). | 059 D4b/D4c + spec nova |
| 14  | Cliente **nasce sozinho** da NF-e importada, só com identidade — regra continua manual.                                                                                                      | 060 D1                  |
| 15  | Agendamento por **WhatsApp** ou pelo **portal do cliente** (`frontend-client`, não o app).                                                                                                   | 060 + specs novas       |

---

## 🆕 Abertas pelas specs novas (061, 062, 063)

### 061 — a viagem fecha a conta

16. Pagamento ao agregado é **por nota** (classe de frete) ou **por viagem** (diária, % do frete)? Se
    houver os dois modelos, o cálculo precisa saber qual aplicar a cada motorista.
17. A margem desconta imposto sobre o frete (ICMS, PIS/COFINS)? _Recomendação: não agora — margem
    operacional, dito na tela._
18. Quem tem `trip.financials`? Só sócio e gerente, ou o operador que monta viagem também precisa ver
    margem para decidir aceitar carga?

### 062 — o WhatsApp

19. **As variáveis de ambiente** (número, WABA id, token, app secret). Você disse que passaria.
20. Um número para toda a operação, ou número por filial? (A 054 está reservada para filial.)
21. O motorista **responde** pelo WhatsApp ou só recebe?
22. Quem atende a inbox — a mesma pessoa que monta viagem, ou atendimento dedicado com papel próprio?

### 063 — o portal do cliente

23. **Rastreamento ao vivo** — é o primeiro pedido que um portal recebe, e depende de posição contínua
    do motorista, que a 057 deliberadamente não coleta. Entra agora, ou o portal mostra "próxima
    parada" sem mapa?
24. Subdomínio por transportadora, ou entrada única com escolha após autenticar?
25. O contato para onde vai o código de acesso — o telefone da NF-e serve, ou precisa confirmação?
26. **Prioridade:** confirma que a 063 vem depois da 062? Ela é a única que não parte de código
    existente, tem a maior superfície de segurança, e o WhatsApp resolve boa parte do mesmo problema
    por muito menos.
