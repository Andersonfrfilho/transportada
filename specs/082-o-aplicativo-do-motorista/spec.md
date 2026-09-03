# 082 — O aplicativo do motorista

- **Estado:** aprovada, não iniciada
- **Repositório de destino:** `~/Documents/personal/transportada-mobile` (fora deste monorepo — ADR-0056 §7)
- **Decisões que a governam:** ADR-0056 (o app nativo), ADR-0057 (endereço errado é ocorrência),
  ADR-0058 (a viagem começa por toque), ADR-0059 (o trajeto é guiado dentro do app)
- **Herda:** ADR-0043 (a nota anda pela viagem), ADR-0045 (a viagem cabe no bolso), ADR-0047 (PKCE),
  ADR-0050 §5 (rastro com consentimento), spec 057 (o PWA de campo e o contrato `/me/trips/*`)
- **Telas aprovadas:** canvas "App do Motorista", 94 quadros, quatro páginas

## O problema

Depois de `dispatched` o produto perde o motorista, e a spec 057 resolveu isso pela metade: o PWA
existe e funciona, mas três coisas que o campo precisa **o navegador não faz**, e duas ficaram
declaradas como não feitas no `evidence.md` dela.

O que o navegador não faz, e nenhum esforço nele resolve:

1. **A posição para quando a tela apaga.** O `watchPosition` é suspenso em segundo plano e morre com
   o aparelho bloqueado — que é a janela inteira em que o caminhão anda. O rastro do portal do
   contratante (ADR-0050 §5) hoje só existe enquanto alguém segura o telefone olhando para ele.
2. **A fila offline drena só com o app aberto.** `Background Sync` não está ligado; a drenagem
   acontece no evento `online` e na abertura da tela.
3. **A foto sem sinal se perde.** O comprovante anexa a uma entrega já confirmada, e enfileirar
   arquivo no navegador esbarra em cota de origem que o navegador decide sozinho.

O que a 057 declarou não feito e o nativo torna barato:

4. **A assinatura não existe na tela.** A rota aceita `kind: 'signature'` com o nome do recebedor, o
   banco guarda, o contrato está fechado — e o PWA só oferece foto do canhoto.
5. **A conferência da foto acontece longe de quem fotografou.** O parser é biblioteca
   (`@adatechnology/document-intake`, ADR-0054), mas quem lê é o servidor, depois; quem fotografou já
   foi embora.

## Requisitos funcionais

### RF-1 — Entrar

- **RF-1.1** A primeira tela tem **um campo**: a URL da instalação. Dela saem marca, logotipo e
  Keycloak, por `GET /public/landing-settings` e `GET /public/landing-logo`.
- **RF-1.2** A URL é canonicalizada antes de gravar (esquema assumido, host em caixa baixa, barra
  final, query e âncora removidas) e mora no armazenamento comum. **Token nunca** — keychain.
- **RF-1.3** **Marca ausente não recusa a instalação**: cai na marca do produto, como o painel faz
  em `LoginIdentifier.page.tsx`. **Keycloak ausente recusa**: sem ele não há para onde mandar quem
  quer entrar.
- **RF-1.4** O login é de dois passos, como o painel: a pessoa diz como é conhecida (e-mail, CPF,
  CNPJ ou telefone), `POST /login-hint` resolve quem é, e a senha é digitada no tema do Keycloak, no
  **navegador do sistema**, por authorization code + PKCE (ADR-0047).
- **RF-1.5** A resolução do identificador é **conveniência, nunca porteiro**: falhou, segue com o que
  a pessoa digitou.

### RF-2 — A viagem

- **RF-2.1** `GET /me/trips/current` resolve a viagem pelo token. **Nenhuma rota recebe id de
  viagem** (ADR-0045 §2).
- **RF-2.2** Duas viagens despachadas são duas linhas escolhíveis. O payload já devolve `trips[]`; o
  PWA mostra a primeira, e isso é o defeito que a 057 declarou.
- **RF-2.3** **Conferir a carga** (`dispatched` → `in_transit`) e **iniciar trajeto**
  (`in_transit` → `on_delivery_route`) são toques do motorista, `trip.report` (ADR-0058).
- **RF-2.4** Duas viagens despachadas são **duas conferências**.
- **RF-2.5** `completed` continua derivado, e fechar uma nota adianta o estado — toque esquecido não
  trava trabalho.

### RF-3 — O trajeto

- **RF-3.1** "Iniciar trajeto" abre o **guia interno**: manobra, traçado, posição com direção, e a
  parada com "Cheguei na parada" na mesma tela (ADR-0059).
- **RF-3.2** **"Abrir no mapa do aparelho" continua na tela.** Sem essa saída, toda falha de provedor
  vira caminhão parado. Ela não é opcional.
- **RF-3.3** O mapa é **desenho nosso**, sem tile de terceiro (ADR-0037).
- **RF-3.4** O guia não reordena parada e não recalcula rota: guiar não é replanejar.

### RF-4 — Entregar

- **RF-4.1** A parada mostra endereço, janela, agendamento com protocolo, e as notas com número,
  série, destinatário, volumes, peso e valor — cada campo com **botão de copiar** de 44px.
- **RF-4.2** **Quem recebeu** é lista fechada: próprio destinatário, cônjuge, vizinho, porteiro,
  outro. "Próprio destinatário" preenche com o que veio na nota e não pede nada digitado.
- **RF-4.3** "Vizinho" pede **onde a carga ficou** — o campo que torna a entrega rastreável no dia
  seguinte.
- **RF-4.4** A assinatura abre em **tela cheia deitada**, com a orientação travada por tela e
  liberada na saída. Colhe traço e nome; **não colhe CPF** (ADR-0045 §7).
- **RF-4.5** A foto do comprovante passa por **recorte**: acha o papel, mostra os cantos arrastáveis,
  corta e endireita **no aparelho**. O limite é 2 MB, em JPEG, PNG ou WebP.
- **RF-4.6** O comprovante tem a **numeração conferida**: código de barras primeiro, dígitos por OCR
  depois. Não conferiu, avisa e oferece tirar outra — **mas deixa enviar**. Leitura que falha por
  completo não acusa nada.
- **RF-4.7** A posição carimba a entrega, uma leitura por confirmação. **Recusa de GPS não bloqueia
  entrega** (ADR-0045 §3.1).

### RF-5 — Ocorrência

- **RF-5.1** Dois catálogos, e a tela não os mistura: **da nota** (`recusa_total`, `recusa_parcial`,
  `avaria_transporte`, `destinatario_ausente`) e **da parada** (`unexpected_charge`, `long_wait`,
  `dock_closed`, `appointment_required`, `other`, mais `wrong_address` da ADR-0057).
- **RF-5.2** A da nota dispara **aviso ao embarcador por template** (spec 079). A tela mostra o texto
  montado antes de enviar. O motorista escolhe o motivo, **nunca escreve o aviso**.
- **RF-5.3** `{{observacao}}` é o campo digitado — é onde entra a NFD que a loja emitiu, número que
  não existe na nossa base.
- **RF-5.4** **Localização negada bloqueia a ocorrência** e leva aos ajustes do aparelho.
- **RF-5.5** **Sem sinal não bloqueia**: grava, enfileira e **continua procurando a posição** até
  fixar. Não veio, sobe como **não aferida**.
- **RF-5.6** Além de **5 km** avisa, grava a distância e deixa seguir.
- **RF-5.7** Fotos do local e da avaria, várias, cada uma pelo mesmo recorte, todas pela fila.

### RF-6 — Offline

- **RF-6.1** Toda confirmação carrega id gerado no aparelho; a idempotência é **do servidor**.
- **RF-6.2** **A tela diz a verdade**: o que está na fila aparece como "aguardando envio", nunca como
  enviado.
- **RF-6.3** O **arquivo entra na fila**, com teto de tamanho e descarte declarado.
- **RF-6.4** Faixa de offline no topo, com a contagem de eventos pendentes.

### RF-7 — Posição em segundo plano

- **RF-7.1** Interruptor no perfil, **desligado por padrão**, com data e hora do aceite.
- **RF-7.2** A permissão de segundo plano é pedida **separada e depois** da de uso, quando a primeira
  viagem é despachada.
- **RF-7.3** **Sem viagem em `dispatched` ou `on_delivery_route` o app não liga o GPS.**
- **RF-7.4** Indicador sempre visível: aviso fixo no Android, indicador do sistema mais a linha na
  tela no iPhone.
- **RF-7.5** Desligar apaga o rastro na mesma transação.
- **RF-7.6** ⚠️ **Bloqueante:** enquanto o teto de idade do envio e o prazo próprio de descarte não
  existirem no servidor, **o app não envia posição em segundo plano** (ADR-0056 §2).

### RF-8 — Buscar e reler

- **RF-8.1** Busca **no aparelho** por número, destinatário e chave, sobre as notas da viagem.
- **RF-8.2** Leitura de etiqueta por câmera; chave de outra viagem diz isso e **continua lendo**.
- **RF-8.3** Entregas concluídas da viagem atual, com quem recebeu e o parentesco.
- **RF-8.4** Arquivos da viagem: DAMDFE e XML do MDF-e.

## Requisitos não-funcionais

- **RNF-1** Uma mão, ao sol, com luva: alvo de toque de 44px, uma coluna, contraste por token.
- **RNF-2** **Tema claro e escuro**, dos mesmos tokens, cópia por valor de `styles/index.css`.
- **RNF-3** Cabeçalho é da transportadora, com o logotipo dela. Rodapé leva a marca do TransportAdA e
  a assinatura da Ada Technology, descolado do conteúdo.
- **RNF-4** Nenhuma regra de viagem em componente React (ADR-0045 §1, ADR-0056 §1).
- **RNF-5** Nenhum valor arbitrário: tudo dos tokens.
- **RNF-6** Nenhum texto fora de `*.locale.json`.
- **RNF-7** Nenhum log de PII, em nível nenhum.

## Fora de escopo

Chat com o escritório · recalcular roteiro · reordenar paradas · tempo estimado de chegada ·
`GET /me/trips/history` · leitura de comprovante já enviado · documento do recebedor. As sete
continuam sem ADR, e a última reverte a ADR-0045 §7.

## O que precisa da API antes

| O que                                                            | Por quê                                             | Bloqueia         |
| ---------------------------------------------------------------- | --------------------------------------------------- | ---------------- |
| `keycloak: {url, realm, clientId}` em `/public/landing-settings` | O app não carrega endereço de autenticação embutido | **RF-1** inteiro |
| `on_delivery_route` em `TRIP_STATUSES` + duas rotas de transição | ADR-0058                                            | RF-2.3           |
| `wrong_address` no CHECK + distância aferida + ponto de atenção  | ADR-0057                                            | RF-5.1, RF-5.6   |
| Aviso ao contratante e painel de ocorrências                     | ADR-0057 §5 e §6                                    | — (é painel)     |
| Teto de idade do envio e expurgo próprio do rastro               | ADR-0056 §2                                         | **RF-7** inteiro |
| Anexo múltiplo em ocorrência (tabela filha)                      | Hoje `attachment_object_id` é uma coluna            | RF-5.7           |

## [NEEDS CLARIFICATION]

- **Provedor de roteirização** para o guia interno: qual, e quem paga a chamada por rota.
- **"Encerrar trajeto"** volta a `in_transit` ou fica em `on_delivery_route`? A ADR-0058 diz que fica;
  falta confirmar com quem opera.
- **Aplicar o desvio em lote** numa parada de cinco notas: uma confirmação para as cinco, ou cinco?
