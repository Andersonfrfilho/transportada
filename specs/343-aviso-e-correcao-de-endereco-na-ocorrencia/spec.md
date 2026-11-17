# Feature 343 — O aviso à contratante e a correção de endereço valem em toda ocorrência

> Estado: rascunho para decisão do Anderson (2026-11-17). Pedido dele, em staging, na ocorrência "Endereço incorreto"
> e na "Cobrança inesperada". Lidas antes: 084, 150, 195, 073, 317, 324, 271, 318, 274.

## Problema

1. **O botão "Avisar a contratante" (324) só existe em ocorrência de nota.** Ocorrência de parada (ex.: "Cobrança
   inesperada", 317) responde 404 na rota e a tela esconde o botão. A tabela do clique
   (`occurrence_contractor_manual_notices`) tem FK para `trip_document_occurrences`, e o plano do envio
   (`findPlan`) recusa `kind = 'stop'`. Pedido: **toda ocorrência tem o botão**.
2. **Corrigir o endereço do cliente "na nossa base" não existe.** A 195 deixou isso fora do escopo (a nota é documento
   fiscal; o texto se corrige na origem, pela 150). Hoje o escritório só corrige **o ponto** (084 `PATCH
/geocoded-addresses/:addressKey`, 195 "Usar este ponto") e, por nota, o desvio de entrega (073, histórico).
   Pedido: o escritório corrige **o texto e o ponto**, e vale para as próximas notas do cliente.
3. **O pedido de correção à contratante (150) só abre pela aba "Clientes a atualizar"** do Workspace NF-e. Pedido: na
   ocorrência de endereço incorreto, enviar **os dois**: o aviso à contratante e o pedido de correção, por e-mail e,
   para quem usa grupo (Única), por WhatsApp.
4. **WhatsApp por tipo**: já publicado em staging (PR #850) para os quatro tipos ativos; falta o modelo do pedido de
   correção de endereço em WhatsApp.

## Decisões do usuário (2026-11-17)

| #   | pergunta                         | resposta                                                                                                                                          |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | alcance da correção do cliente   | **só cliente com CNPJ, próximas notas**; pessoa física fica fora até haver decisão de proteção do CPF (T1c da 084)                                |
| b   | corrigir texto e ponto?          | **os dois**, depois que o escritório corrige                                                                                                      |
| c   | pedido de correção na ocorrência | **sim, os dois e-mails** (aviso e pedido de correção)                                                                                             |
| d   | WhatsApp                         | **cada tipo ativo tem modelo de WhatsApp**, para aviso e para pedido de correção                                                                  |
| e   | botão em toda ocorrência         | **sim**, nota e parada                                                                                                                            |
| f   | "nunca avisar" (321 D2)          | **não existe**: a marca do tipo (`blocks_contractor_notice`) só cala o **automático**; o botão, o chat e o portal à mão valem sempre (2026-11-17) |

## Requisitos

- **RF1 — Aviso manual em ocorrência de parada.** `POST|GET /trip-occurrences/:id/contractor-notice` aceita o id de
  ocorrência de parada **que tem nota** (a contratante vem da nota, no servidor). Parada sem nota: o botão aparece
  desabilitado, com o motivo ("a ocorrência não tem nota; sem contratante a avisar"). Mesmas regras da 324: um aviso
  por ocorrência, canal do servidor, `occurrences.resolve`, marca da 321, 409 se o automático já avisou.
- **RF2 — Só o botão.** O aviso **automático** segue desligado em `unexpected_charge` (317 RF7 não é revogada); o
  botão é a exceção, por decisão humana a cada clique. Nenhum envio sai sozinho.
- **RF3 — Registro do clique para os dois tipos.** `occurrence_contractor_manual_notices` ganha `occurrence_kind`
  (`document` | `stop`, padrão `document`) e a FK cai para `(company_id, occurrence_id)` sem tabela única (molde de
  `occurrence_conversations`, que já faz assim). Migration aditiva, com rollback.
- **RF4 — Correção do endereço do cliente (texto).** Nova camada de correção por (empresa, CNPJ do cliente, chave do
  endereço da nota): o texto corrigido (logradouro, número, complemento, bairro, município IBGE, UF, CEP) **vale
  por cima** do endereço da nota na leitura de destino (`resolvePhysicalDestination`), nunca altera
  `nfe_addresses` nem o XML (RF1 da 150, ADR-0057). Só CNPJ (RF a). Precedência: desvio manual da nota (073) →
  correção do cliente → `<entrega>` → `<enderDest>`.
- **RF5 — Correção do ponto.** Reusa a 084/195: quem corrige o texto corrige o ponto na mesma tela (pino no mapa);
  gravar texto novo invalida a coordenada anterior daquela chave e pede geocodificação ou pino.
- **RF6 — Quem e como.** `occurrences.resolve` (a mesma da 195); trilha em `audit_logs` com antes e depois (texto
  mascarado no log). Reabrir/desfazer: nova correção, nunca apagar a anterior (histórico).
- **RF7 — Pedido de correção na ocorrência.** Na ocorrência "Endereço incorreto" a tela oferece, ao lado do aviso,
  "Pedir correção do endereço" (150): e-mail aos contatos da contratante e, com grupo da 318, mensagem de WhatsApp
  no grupo. Reusa `address_correction_requests`; nenhum envio automático.
- **RF8 — Modelo de WhatsApp do pedido.** Chave `ocorrencia.correcao-endereco` com versão `whatsapp` (lista fechada de
  variáveis do grupo; sem CNPJ), publicada pelo script de modelos, com simulação antes de gravar.

## Fora do escopo

- Pessoa física (CPF): aguarda decisão sobre proteção do dado (084 T1c).
- Aviso automático em ocorrência de parada.
- Alterar o XML ou `nfe_addresses`.
- Recalcular a rota de viagem em curso por causa da correção (195, ADR-0080 §4).

## Pendências para o Anderson

1. Confirmar RF2 (só o botão em parada; automático segue desligado em "Cobrança inesperada").
2. RF4: a correção vale **por cliente + endereço da nota** (recomendado) ou **por cliente inteiro**?
3. Ocorrência de parada **sem nota** não tem contratante: ficar desabilitado (recomendado) ou escolher a contratante?
