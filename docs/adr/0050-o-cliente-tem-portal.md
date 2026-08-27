# ADR-0050 — O portal do cliente é outra app, e ele entra sem senha

- **Status:** aceito
- **Data:** 2026-08-27
- **Contexto:** spec 063. Consome a 060 (agendamento e repasse) e a 057 (execução de campo).

## Contexto

Duas coisas do produto pedem uma superfície que não existe: o cliente agendando a própria entrega e o
contratante aprovando o repasse de taxas. Hoje as duas só têm dois caminhos — ligar para alguém, ou o
WhatsApp — e os dois dependem de uma pessoa da transportadora do outro lado.

Nunca houve, em nenhum repositório do ecossistema, um app com login de **quem não é funcionário**.
Isso é o que torna esta decisão diferente das outras: o risco aqui não é errar uma regra de negócio,
é expor a operação inteira.

## Decisão

### 1. App separado, e a separação é de segurança

`apps/frontend-client` tem build, domínio e bundle próprios. Não é uma rota a mais no painel.

O painel interno carrega frota, financeiro, fiscal e cadastro. Servir o mesmo bundle a um usuário
externo é depender de que **toda** condicional de permissão no cliente esteja certa, para sempre, em
todo deploy — e uma falha ali expõe tudo. Bundles separados transformam isso num erro **impossível**
em vez de num erro improvável.

São três superfícies com três públicos: painel, PWA do motorista, portal do cliente.

### 2. A identidade é o documento, e a autenticação não é senha

Senha para cada cliente é criar um problema de suporte permanente — recuperação, rotação, vazamento —
por um uso que é ocasional: o cliente entra quando tem entrega, não todo dia.

**Código de uso único**, enviado ao contato que a própria NF-e trouxe. O padrão já existe no produto
(ADR-0030, recuperação de senha), e daqui saem três exigências que **não** são opcionais:

- **a resposta é idêntica para documento cadastrado e não cadastrado**, e o tempo também. Sem isso o
  portal vira oráculo: quem tenta documentos aprende quais existem, e descobre a carteira de clientes
  da transportadora;
- **limite de tentativa por documento e por IP**, com espera crescente;
- **nunca revelar para onde o código foi**, nem mascarado — máscara que permite confirmar um telefone
  é confirmação.

### 3. A empresa é conhecida antes do login

A instalação é dedicada: um deploy por transportadora (ADR-0021). O portal daquela instalação é o
portal daquela transportadora, e o documento resolve **dentro** dela.

Isso não é conveniência de infraestrutura: é o que impede a resposta do login de revelar em quantas
transportadoras aquele documento aparece. "Entrada única com escolha depois de autenticar" só faria
sentido num produto multiempresa hospedado, que este não é.

### 4. O servidor decide o que é do cliente

Mesmo princípio do PWA do motorista, e pela mesma razão — BOLA é o campeão de vulnerabilidade em API
REST. As rotas são `/client/me/*` e **não recebem id de viagem, de nota nem de cliente**: o servidor
resolve pelo documento da sessão, e mesmo a chave de acesso é conferida contra ele antes de qualquer
leitura.

E o que o cliente vê é **menos** do que o sistema sabe: qual nota, qual status, quando chega, e o
comprovante. Sem placa, sem nome de motorista, sem valor de frete, sem margem. Cada campo a mais no
payload é um campo a mais para vazar — e por isso o payload mínimo é **contrato de teste**, não
disciplina de quem escreve a rota.

### 5. Rastreamento ao vivo existe, com consentimento e com prazo

O portal mostra onde a carga está agora. Isso muda o PWA do motorista, porque a execução de campo
carimbava posição só na entrega, e o mapa exige posição contínua.

Três travas, e elas são a razão de isto poder existir:

- **o motorista consente**, num interruptor desligado por padrão, com data e hora do aceite. Com ele
  desligado o portal mostra o progresso por parada e diz que a posição não está disponível — nunca a
  última posição conhecida de ontem;
- **o ping vive pouco**: ele é apagado quando a viagem fecha. Posição contínua é dado pessoal do
  trabalhador, e guardá-la vira histórico de deslocamento de uma pessoa. O que sobrevive é o carimbo
  da entrega, com o expurgo de 90 dias que já existia;
- **o cliente vê a carga, não o motorista**: um ponto e a distância até a parada dele. Sem placa, sem
  nome, sem velocidade, sem trajeto. A pergunta dele é "chega quando?", e ela se responde sem
  entregar a rotina de trabalho de ninguém.

**O mapa é desenho nosso.** Nada de tile de terceiro: a CSP declara `frame-src 'none'` desde a
ADR-0037, e a malha do IBGE já é o mapa das zonas de frete no painel. O portal usa a mesma malha com
o ponto por cima — nenhum terceiro renderiza dentro da tela, e nenhuma coordenada de cliente sai
daqui.

### 6. Agendar e aprovar são as rotas que já existem

O agendamento do portal escreve em `trip_stop_schedules` pela mesma máquina de estados da 060; a
aprovação do repasse usa o mesmo ciclo, linha a linha. Nenhuma regra mora no portal — se morasse, no
dia em que o WhatsApp também agendar, as duas divergiriam, e divergência de agendamento manda caminhão
para o lugar errado.

O que muda é **quem chama** e **o que é oferecido**: o cliente vê janelas disponíveis, não o
formulário do operador; e a trilha registra que a decisão veio de ator externo, com documento e
sessão.

## Consequências

- Aparece a quarta app do monorepo, com CSP, PWA e deploy próprios.
- Aparece a terceira superfície anônima do produto (depois do postback da NFS-e e da página de
  repasse) — e é a primeira com **sessão**. É a de maior risco, e é por isso que o payload mínimo e a
  resposta uniforme são teste, não intenção.
- O PWA do motorista ganha um interruptor e um trilho de posição, com expurgo no fechamento da viagem.
- Todo destinatário passa a poder entrar **desde o primeiro dia**, sem ninguém cadastrar nada — porque
  o cadastro dele nasce da nota (ADR-0048 §1). Era a consequência menos óbvia daquela decisão.

## Alternativas descartadas

| Alternativa                                 | Por que não                                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Rota a mais no painel interno               | Depender de toda condicional de permissão no cliente estar certa, para sempre, em todo deploy   |
| Conta com senha por cliente                 | Problema de suporte permanente por um uso ocasional                                             |
| Mascarar o contato para onde o código foi   | Máscara que permite confirmar um telefone é confirmação                                         |
| Entrada única com escolha de transportadora | A tela de escolha revela em quais a pessoa está cadastrada — informação de carteira             |
| Mapa com tiles de terceiro                  | A CSP fecha `frame-src` desde a ADR-0037, e a coordenada do cliente sairia daqui                |
| Rastrear sem consentimento do motorista     | Histórico de deslocamento de pessoa, coletado por padrão, é o que a LGPD trata como sensível    |
| Guardar o rastro depois da viagem           | Vira histórico de rotina de trabalho; o carimbo da entrega já responde o que a operação precisa |
| Regra de agendamento própria do portal      | No dia em que o WhatsApp agendar, as duas divergem — e caminhão vai para o lugar errado         |
