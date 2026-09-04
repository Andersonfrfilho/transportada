# Spec 082 — O campo ganha fila visível, assinatura e comprovante que não se perde

- **Data:** 2026-09-03
- **Estado:** aprovada para planejamento
- **Base:** spec 057 (PWA de campo), ADR-0045, ADR-0050 §5, ADR-0056
- **Mockups aprovados:** https://claude.ai/code/artifact/a23964a6-b2c3-41f9-8c5b-4c120b134a5b
- **Goal:** `.omc/ultragoal/plans/1788457587718-desenvolver-o-pwa-de-campo-do-motorista/`

## Contexto

O PWA de campo existe desde a 057: módulo `driver-trip` do `frontend-transportada`, uma página
única sobre `/me/trips/current/*`, fila offline em IndexedDB drenada em `online` + abertura.
O `evidence.md` da 057 deixou lacunas declaradas, e os mockups aprovados fecham parte delas e
acrescentam decisões novas. **Esta spec é um delta sobre o módulo existente — nenhuma app nova.**

Três decisões do dono do produto (2026-09-03), que revisam ADRs por escrito:

1. **Documento do recebedor é configurável.** A ADR-0045 §7 proibia colher CPF; a revisão é
   condicional: o painel ganha configuração de quais campos do comprovante são obrigatórios,
   opcionais ou desligados (`receiverName`, `receiverDocument`, assinatura, foto) — **geral por
   empresa, com exceção por CNPJ do destinatário**. Colher documento exige o custo que a ADR
   nomeou: envelope A256GCM (padrão ADR-0039), máscara em toda leitura, e nunca em log. Nova ADR.
2. **O motorista inicia o trajeto.** O `dispatch` deixa de ser exclusivo do escritório: o motorista
   vinculado à viagem (`trip_drivers`) pode despachá-la pelo app. A porta de não-retorno e o
   congelamento do roteiro não mudam — muda quem pode abri-la. Nova regra de domínio + ADR.
3. **Só a viagem corrente.** Sem `GET /me/trips`, sem lista de roteiros, sem histórico com anexos.
   As telas "Roteiros" e "Entregas da viagem (histórico)" dos mockups ficam **fora de escopo**.

## Escopo — deltas

| #   | Delta                                                                                                                                                                                                                                                                                                                                                                                          | Onde                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| D1  | Shell: bottom bar (Viagem · Perfil), header com marca + empresa + foto do motorista, barra de progresso da viagem (paradas resolvidas / total)                                                                                                                                                                                                                                                 | frontend `driver-trip`  |
| D2  | Parada: distância até o endereço (haversine da última posição, GPS opcional — sem posição, oculta) ao lado do "Abrir no Maps" já existente                                                                                                                                                                                                                                                     | frontend                |
| D3  | Assinatura em canvas: traço + `receiverName`, modo tela inteira **travado em landscape** (Fullscreen API + `screen.orientation.lock`; iOS: rotação por CSS). Usa o `kind: 'signature'` que a rota `proof` já aceita                                                                                                                                                                            | frontend                |
| D4  | Configuração do comprovante: `company_delivery_proof_settings` (geral) + exceção por CNPJ do destinatário; campos: nome, documento, assinatura, foto — cada um `required/optional/off`. Painel edita na tela de viagens ("configuração perto do efeito"). `receiverDocument` criptografado (envelope, AAD `transportada:delivery-proof:v1:${companyId}:${proofId}`), mascarado em toda leitura | api + painel            |
| D5  | Recorte do comprovante no aparelho: detecção de bordas em canvas, ajuste manual, upload só do recorte                                                                                                                                                                                                                                                                                          | frontend                |
| D6  | Comprovante entra na fila offline: arquivo no IndexedDB com **teto declarado** (tamanho e contagem) e descarte anunciado — a tela nunca mente sobre o que não subiu (ADR-0045 §5)                                                                                                                                                                                                              | frontend                |
| D7  | Tela de eventos pendentes: lista da fila com tipo, hora, anexos, status (`na fila`/`falhou N× com causa legível`), **envio manual por evento e em lote**; entrada pelo Perfil e pelo banner                                                                                                                                                                                                    | frontend                |
| D8  | Ocorrência: motivo tipado → **template de notificação** da transportadora com prévia na tela (motorista nunca escreve o aviso); chaves novas em `NOTIFICATION_TEMPLATE_KEY`, envio pelo trilho `notification.v1` quando o evento sincroniza; fotos do local/carga pela rota `proof`/`occurrences` existente                                                                                    | api + worker + frontend |
| D9  | Dispatch pelo motorista: `POST /me/trips/current/dispatch` (viagem em `route_planned` do próprio vínculo); botão "Iniciar trajeto"; "Finalizar viagem" **não existe como ação** — `completed` segue derivado das notas (o botão do mockup vira estado)                                                                                                                                         | api + frontend          |

## Fora de escopo

- App nativo e posição em segundo plano (ADR-0056, repo `transportada-mobile`).
- Lista de viagens, histórico e anexos de viagem concluída (decisão 3).
- Background Sync do service worker (drenagem segue: `online` + abertura + **manual, novo**).
- Telas de escritório além do painel de configuração do comprovante (D4).
- Repasses e qualquer superfície do portal do contratante.

## Regras que amarram

- Nenhuma regra de viagem em componente React (ADR-0045 §1); toda decisão nova nasce no domínio e
  `me-trip.integration.ts` continua provando a viagem inteira sem browser.
- Idempotência do servidor por evento da fila (padrão `*_processed_messages`); repetir converge.
- Payload de fila carrega referência, nunca bytes (security.md §6); bucket privado, presigned URL.
- Tenant: toda query nova com `companyId` do contexto + contrato negativo de isolamento.
- Tokens quadrados do painel (radius 0); contratos de design system valem para o módulo.
- Contratos e testes de aceite **antes** da implementação; task só fecha com evidência.

## Critérios de aceite (resumo por delta)

- D3: proof `signature` chega ao bucket com `receiverName`; contrato de tela prova o modo
  tela-inteira e o lock; sem canvas suportado, cai para foto.
- D4: painel salva configuração; app obedece (campo obrigatório bloqueia confirmar; `off` não
  renderiza); documento nunca aparece sem máscara em resposta de leitura; contrato negativo de log.
- D6/D7: evento com foto criado sem rede sobrevive a reload; envio manual drena um e todos;
  falha mostra causa; teto atingido é anunciado antes de descartar.
- D8: motivo sem template configurado não bloqueia a ocorrência (aviso só não sai); prévia bate
  com o template renderizado pelo worker (contrato de paridade da chave).
- D9: dispatch pelo motorista de viagem `route_planned` do próprio vínculo → `dispatched` com
  snapshot congelado; de outro vínculo → 403; repetido → `unchanged`.
