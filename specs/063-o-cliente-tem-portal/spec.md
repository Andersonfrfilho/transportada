# 063 — o cliente tem portal

> **A mais aberta das seis.** As specs 056–062 partem de código existente e auditado; esta parte de
> uma intenção. `PROJECT.MD:1559` reserva a seção "21.11. Portal do cliente" e a lista como fase
> posterior — e não existe hoje, em nenhum repositório do ecossistema, um app com login de quem não é
> funcionário. **Ler as Dúvidas antes de estimar.**

## Problema e resultado

Duas coisas desta rodada de specs pedem uma superfície que não existe: o cliente agendando a própria
entrega (060 D3, sua resposta ao item 15) e o contratante aprovando o repasse de taxas (060 D5,
pergunta 12 ainda aberta). As duas hoje só têm dois caminhos — ligar para alguém, ou o WhatsApp da
062 — e os dois dependem de uma pessoa da transportadora do outro lado.

O resultado desta feature é `apps/frontend-client`: um app enxuto onde **quem não trabalha aqui**
entra e resolve o que é dele. Cliente: minhas entregas, quando chegam, agendar. Contratante: as
taxas do período, aprovar ou recusar.

## Fora do escopo

- Qualquer função de operação. O portal **lê** e **decide sobre o que é do cliente**; não monta
  viagem, não separa, não emite documento.
- Rastreamento ao vivo do veículo no mapa. Ver Dúvidas — é o pedido mais provável e o de maior custo.
- Cotação e contratação de frete pelo portal.
- Substituir o WhatsApp (062). Os dois convivem: WhatsApp é onde o cliente já está; o portal é onde
  ele resolve o que não cabe numa conversa.

## Decisões

### D1 — App separado, e a separação é de segurança, não de organização

`apps/frontend-client` é build próprio, domínio próprio e bundle próprio. Não é uma rota a mais no
`frontend-transportada`.

O motivo é a superfície: o painel interno carrega frota, financeiro, fiscal e cadastro. Servir o
mesmo bundle para um usuário externo é depender de que **toda** condicional de permissão no cliente
esteja certa, para sempre, em todo deploy. Uma falha ali expõe a operação inteira. Bundles separados
transformam isso num erro impossível em vez de num erro improvável.

O `.app` do motorista (057) também não é aqui — ele é do PWA interno. São três superfícies com três
públicos.

### D2 — A identidade do cliente é o documento, e a autenticação não é senha

Criar conta com senha para cada cliente é criar um problema de suporte (recuperação, rotação,
vazamento) por um uso que é ocasional — o cliente entra quando tem entrega, não todo dia.

**Autenticação por código de uso único**, enviado ao contato cadastrado (WhatsApp pela 062, ou
e-mail): o cliente informa o documento, recebe o código, entra, e a sessão dura o suficiente para
resolver o que veio resolver. O padrão já existe no produto e está registrado — ADR-0030,
"recuperação de senha por código de uso único", com implementação em
`apps/worker-transportada/src/identity/`.

Isso puxa exigências que **não** são opcionais:

- O código é curto, tem prazo curto, e tem **limite de tentativa por documento e por IP**. Sem isso,
  o portal vira oráculo: quem tenta documentos aprendendo quais existem descobre a carteira de
  clientes da transportadora.
- **A resposta é idêntica para documento cadastrado e não cadastrado.** "Se este documento estiver
  cadastrado, enviamos um código" — sempre, com o mesmo tempo de resposta.
- Nunca revelar para onde o código foi. Nem parcialmente mascarado, se o mascaramento permitir
  confirmar um telefone.

### D3 — O cliente vê o que é dele, e o servidor é quem decide o que é dele

Mesmo princípio da 057 D1, e pela mesma razão (BOLA/API1 é o campeão de vulnerabilidade em REST): as
rotas do portal **não recebem id de viagem, de nota nem de cliente**. Elas são `/me/*`, e o servidor
resolve pelo documento da sessão.

`GET /client/me/deliveries`, `GET /client/me/deliveries/:accessKey` — e mesmo a chave de acesso é
verificada contra o documento da sessão antes de qualquer leitura.

E o que ele vê é **menos** do que o sistema sabe. O cliente não precisa da placa, do nome do
motorista, do valor do frete nem da margem (061). Ele precisa de: qual nota, qual status, quando
chega, e o comprovante quando entregue. Cada campo a mais no payload é um campo a mais para vazar.

### D4 — Aprovar taxa é a função do contratante, e ela é o mesmo ciclo

Se o portal existir, a pergunta 12 se responde sozinha: o contratante aprova **dentro** do produto.
Ele entra, vê o lote do período com os lançamentos, aprova ou recusa **linha a linha** com motivo, e
a 060 D5 registra a decisão com o ator externo identificado.

Recusa linha a linha, e não do lote inteiro, porque é assim que a divergência real acontece — ele
aceita 36 das 38 e questiona duas. Aprovação em bloco força a conversa a sair do sistema, que é
exatamente o que o portal existe para evitar.

A trilha guarda que a decisão veio de um ator externo, com documento e sessão — `security.md` §10.

### D5 — Agendar pelo portal é a mesma rota que agenda pelo painel

O agendamento do cliente escreve em `trip_stop_schedules` (060 D3), pela mesma máquina de estados,
com a mesma validação. Muda quem chama e o que é oferecido — o cliente vê janelas disponíveis, não o
formulário do operador.

Nenhuma regra de agendamento mora no portal. Se ela morar, o dia em que o WhatsApp (062 P3) agendar
também, as duas divergem — e divergência de agendamento manda caminhão para o lugar errado.

### D7 — O rastreamento ao vivo existe, e ele tem três travas

O portal mostra **onde a carga está agora**, e isso muda o PWA do motorista: a 057 D3 carimba a
posição só na entrega, e o mapa exige posição contínua. As três exigências abaixo não são detalhes de
implementação — elas são a razão de a coisa poder existir:

1. **O motorista consente, e o consentimento é dele.** Um interruptor no PWA, desligado por padrão,
   com data e hora do aceite gravadas. Enquanto ele estiver desligado, o portal mostra o progresso
   por parada e diz que a posição não está disponível — nunca a última posição conhecida de ontem.
2. **O ping vive pouco.** Posição contínua é dado pessoal do trabalhador, e guardá-la vira histórico
   de deslocamento de uma pessoa. Ela é apagada quando a viagem fecha; o que sobrevive é o carimbo da
   entrega, que a 057 já guardava com expurgo de 90 dias.
3. **O cliente vê a carga, não o motorista.** O portal mostra um ponto e a distância até a parada
   dele — sem placa, sem nome, sem velocidade, sem histórico do trajeto. A pergunta que ele tem é
   "chega quando?", e ela se responde sem entregar a rotina de trabalho de ninguém.

**O mapa é desenho nosso.** Nada de tile de terceiro: a CSP declara `frame-src 'none'` desde a
ADR-0037, e a malha do IBGE já é o mapa das zonas de frete no painel. O portal usa a mesma malha, com
o ponto por cima — nenhum terceiro renderiza dentro da tela, e nenhuma coordenada de cliente sai
daqui.

### D6 — Cliente sem cadastro de regra também tem portal

A 060 D1 faz o cliente nascer sozinho da NF-e importada, só com identidade. Isso significa que **todo
destinatário já pode entrar no portal** desde o primeiro dia, sem ninguém cadastrar nada — ele vê as
entregas dele. Só o agendamento depende de `requires_scheduling` estar ligado.

É a consequência mais valiosa da sua decisão no item 14, e ela não era óbvia quando foi tomada.

## Histórias priorizadas

**P1 — entrar sem senha**
_Dado_ um destinatário com entrega,
_quando_ informa o documento e o código recebido,
_então_ entra. Documento inexistente recebe a mesma resposta, no mesmo tempo.

**P1 — minhas entregas**
_Dado_ um cliente autenticado,
_quando_ abre o portal,
_então_ vê as notas destinadas a ele, com status e previsão — e nada de placa, motorista ou valor.

**P1 — a entrega concluída mostra o comprovante**
Data, hora, e o comprovante quando houver (057 D4).

**P2 — agendar**
_Dado_ um cliente com `requires_scheduling`,
_quando_ escolhe uma janela oferecida,
_então_ o agendamento vai a `confirmed` com protocolo, pela rota da 060.

**P2 — o contratante aprova o repasse**
_Dado_ um lote `submitted`,
_quando_ o contratante entra,
_então_ vê os lançamentos com data, cliente, nota, tipo e valor, e aprova ou recusa **linha a linha**
com motivo.

**P3 — histórico e exportação**
Entregas do período, com filtro e exportação.

**P3 — avisar quando mudar**
Notificação (062) quando a entrega entra em rota ou é concluída.

## Requisitos funcionais

1. `apps/frontend-client`: React + Vite, PWA, mobile-first, seguindo `web.md` e os tokens de
   `theme.constant.ts` — é a mesma marca vista de fora.
2. Autenticação por código de uso único (D2), com limite de tentativa por documento e por IP,
   resposta uniforme e tempo de resposta uniforme.
3. Sessão curta, token em memória ou cookie `HttpOnly`+`Secure`+`SameSite`; **nunca** refresh token
   em `localStorage` (`security.md` §8).
4. Rotas `/client/me/*` (D3), com escopo próprio — nenhuma reaproveitada do painel interno.
5. Payload mínimo por desenho, com teste que **falha** se campo proibido aparecer (D3).
6. Agendamento pela rota da 060 (D5).
7. Aprovação de lote linha a linha (D4), registrando ator externo.
8. Rate limit por documento e por IP em toda rota do portal; mais duro no login.
9. CSP e cabeçalhos próprios do app, sem herdar o do painel.
10. Texto em `*.locale.json`.

## Requisitos não funcionais

- **O portal não pode ser um oráculo de carteira de clientes.** Resposta uniforme, tempo uniforme,
  limite de tentativa — e um teste que prova as três.
- Nenhum dado pessoal em query string (nem documento, nem chave de acesso).
- Nenhum campo de operação interna no payload, verificado por contrato.
- Mobile-first de verdade: a maioria vai entrar pelo link do WhatsApp, no celular, uma vez.
- Multiempresa: o portal serve várias transportadoras; o documento do cliente resolve **dentro** de
  uma empresa, e o isolamento tem teste negativo.
- Trilha de toda ação de ator externo.

## Casos extremos e falhas

| Caso                                         | Comportamento                                                                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Documento em duas transportadoras do sistema | O portal precisa saber qual — por subdomínio, ou o cliente escolhe após autenticar. Ver Dúvidas.                                             |
| CPF de pessoa física como destinatário       | Mesmo fluxo. E o cuidado é maior: é dado pessoal, e o portal não pode confirmar existência.                                                  |
| Código pedido dez vezes seguidas             | Limite por documento, com espera crescente, e o mesmo texto de resposta.                                                                     |
| Cliente sem contato cadastrado               | Não há para onde mandar o código. A resposta continua uniforme; internamente, vira pendência de cadastro.                                    |
| Nota cancelada                               | Aparece como cancelada, não some.                                                                                                            |
| Entrega com ocorrência                       | O cliente vê que houve ocorrência e o tipo — nunca a descrição interna nem a foto, que podem conter observação do motorista sobre o cliente. |
| Contratante que também é destinatário        | Duas visões no mesmo login, separadas por aba.                                                                                               |

## Critérios de aceite

- [ ] Teste de que documento cadastrado e não cadastrado produzem resposta **e tempo** equivalentes.
- [ ] Teste de limite de tentativa por documento e por IP.
- [ ] Teste de que nenhuma rota do portal aceita id de viagem, nota ou cliente vindo do cliente.
- [ ] Teste de contrato do payload: campo interno (placa, motorista, valor, margem, ocorrência
      descritiva) **reprova**.
- [ ] Teste negativo de tenant.
- [ ] Teste de que o agendamento pelo portal e pelo painel passam pela mesma máquina de estados.
- [ ] Teste de aprovação linha a linha com ator externo na trilha.
- [ ] Conferido em 375px.
- [ ] `tsc --noEmit` + `make validate`.
- [ ] Teste de que o consentimento desligado esconde a posição, e de que o ping some quando a viagem
      fecha (D7).
- [ ] Teste de que a posição servida ao cliente não carrega placa, motorista, velocidade nem trajeto.
- [ ] ADR (**0050** — 0049 já é da 061) sobre app separado por superfície de segurança, autenticação
      sem senha, e o rastreamento com consentimento e expurgo.
- [ ] `docs/SECURITY.md` com a seção do portal: enumeração, retenção de sessão, dado exposto.

## Dúvidas

- **Rastreamento ao vivo** (respondido): **entra**, e com mapa. Ver D7 — ele muda o PWA do motorista,
  cria retenção de posição pessoal e traz três exigências de LGPD que não são opcionais.
- **Qual transportadora** (respondido pela arquitetura): **subdomínio por empresa**, porque a
  instalação é dedicada — um deploy por transportadora (ADR-0021). A empresa é conhecida **antes** do
  login, e é isso que impede a resposta do código de revelar em quantas transportadoras aquele
  documento existe. "Entrada única com escolha depois" só faria sentido num produto multiempresa
  hospedado, que este não é.
- **Contato do código** (respondido): **o da própria NF-e** (`nfe_addresses.phone` e o e-mail do
  participante). Primeiro acesso funciona sem ninguém cadastrar nada, que é a diferença entre um
  portal que existe e um que existe só para quem pediu. Nota com contato errado simplesmente não
  entrega o código — e **isso não é dito a quem tentou**, pela mesma regra da resposta uniforme.
- **Prioridade** (respondido): ela vem **antes** da 062, que segue travada na escolha do provedor de
  WhatsApp. O portal e o WhatsApp continuam convivendo pelo desenho de fora do escopo: um é onde o
  cliente já está, o outro é onde ele resolve o que não cabe numa conversa.

## 🤖 Modelo

| Etapa                                            | Modelo    |
| ------------------------------------------------ | --------- |
| Autenticação, enumeração, isolamento, ADR-0049   | `opus` 🧠 |
| Contrato de payload mínimo e testes de vazamento | `opus` 🧠 |
| App, telas, rotas                                | `sonnet`  |
| Locale e responsividade                          | `sonnet`  |
