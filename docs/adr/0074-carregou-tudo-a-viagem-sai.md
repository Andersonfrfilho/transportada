# ADR-0074 — Carregou tudo, a viagem sai

- **Status:** aceita
- **Data:** 2026-09-24
- **Decisores:** usuário, na conversa da spec 185 (`specs/185-carregou-tudo-a-viagem-sai/`)
- **Revisa:** ADR-0043 §1 (despacho como transição só manual) · ADR-0058 "O motorista abre a porta
  do despacho" §"congelar na saída" · ADR-0058 "A viagem começa por toque do motorista" (conferir a
  carga) · spec 056 P1 (:155-159) · spec 164 D8 ("a ocorrência só anota")
- **Mantém:** ADR-0043 §2 (despachada é porta de não-retorno) e §"sem alguém assinar" · ADR-0048
  (gate de agendamento) · ADR-0068 (todo evento de status tem ator humano)

## Contexto

Em staging, uma viagem com as quatro notas separadas e carregadas ficou parada em `loading`: o
despacho era um clique que ninguém sabia que faltava. Depois do clique, o escritório ainda viu
"Conferir carga" — uma segunda conferência de algo que o barracão acabara de conferir nota por nota.

O usuário descreveu o fluxo como ele é na operação: **separar → carregar → entregar**. A conferência
acontece no carregamento. Despachar e conferir são passos que o sistema pedia e a operação não tem.

## Decisão

1. **O despacho é derivado quando a carga fecha.** A escrita que deixa toda nota viva da viagem
   `loaded` — carregar uma nota, carregar em lote, pelo web ou pelo WhatsApp, ou registrar a
   ocorrência que tira a última pendente (item 4) — despacha a viagem na sequência, com o mesmo ator
   e o mesmo canal da escrita. Não há ator de sistema: ADR-0068 continua valendo sem afrouxar coluna.
2. **O despacho automático nunca força.** Se um gate recusa — parada de cliente sem agendamento
   (ADR-0048), nota viva sem parada (`TRIP_HAS_NO_ROUTE`) — a viagem fica em `loading` e a resposta
   da escrita diz o motivo. O botão "Despachar" termina o serviço depois que a pendência se resolve.
   "Sem alguém assinar" (ADR-0043) continua a regra para despacho com pendência.
3. **O botão "Despachar" leva todas.** Com nota `pending`/`separated`, o clique do escritório separa
   e carrega o que falta e despacha, numa transação, depois de uma confirmação que diz quantas notas
   serão carregadas. Tirar uma nota da viagem é antes, desvinculando-a. O `force` com motivo (que
   **libera** as não carregadas) continua na API para os canais que já o usam (WhatsApp, app do
   motorista), mas sai da tela do escritório.
4. **O tipo de ocorrência decide se a viagem segue sem a nota.** O catálogo ganha, só para tipos de
   separação, "a viagem segue sem a nota" (padrão desligado). Ocorrência aberta desse tipo, **sobre a
   nota inteira**, tira a nota da conta de "tudo carregado", e o despacho a libera da viagem
   (`released_at`, o mesmo mecanismo do `force`), registrando o motivo sem pedir assinatura — a
   assinatura é a do cadastro do tipo, feita por quem tem `settings.manage`. Ocorrência sobre parte
   dos itens não tira a nota: avaria em 2 de 50 volumes sai com a nota (spec 056 D7, "parcial é
   ocorrência, não estado").
5. **"Conferir carga" deixa de ser oferecido**, no escritório e no app do motorista. A conferência
   é o carregamento. A rota `confirm-load` segue aceita e idempotente para aparelho com versão velha;
   "Iniciar rota" já parte de `dispatched` (`checkFieldStart`) e continua sendo o "saí" do motorista.
6. **`dispatched` passa a significar "carga fechada".** O que já contava do despacho — congelamento
   do ETA, "A caminho" no portal, início do rastreamento, janela de 36h — continua contando do
   despacho. O ETA pode nascer adiantado quando o caminhão demora no pátio; é o custo aceito da
   simplicidade, registrado aqui para quem for ler um ETA otimista.
7. **O despacho não exige CT-e.** A prontidão fiscal ("0 de 4 notas prontas") continua aviso, não
   gate — como já era.

## Consequências

- A viagem com carga completa não depende mais de alguém lembrar do clique. A que não sai por gate
  diz por quê, em vez de "o servidor recusou".
- A spec 164 D8 ("a ocorrência só anota") passa a ter uma exceção explícita e opt-in por tipo. O
  contrato "`allowed-actions` byte a byte igual com tratativa aberta" continua: o que muda é a conta
  do despacho, não as ações da nota.
- A ADR-0058 "porta do despacho" perde o motivo "congelar na saída"; o despacho pelo motorista
  continua existindo para viagem sem carregamento registrado.
- Trilha: o evento de status do despacho automático carrega o ator e o canal de quem carregou a
  última nota, e o snapshot registra `forced = false`; a nota deixada para trás por ocorrência leva
  o motivo derivado do tipo.
