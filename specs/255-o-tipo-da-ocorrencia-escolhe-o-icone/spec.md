# Feature 255 — O tipo da ocorrência escolhe o ícone

Data: 2026-10-07 · Autor do pedido: usuário (sessão do painel de viagens)

## Problema

Os tipos de ocorrência aparecem como texto puro: nos chips do app do motorista, nos cartões do painel
(`TripOccurrences`) e na aba Tipos. Quem confere em campo ou na tela não distingue "Item avariado" de
"Devolução parcial" de relance. Nenhum tipo tem ícone hoje (verificado: sem coluna, sem mapa, sem
seletor), e o repo proíbe nome de tipo no código — então o ícone tem de ser **dado do tipo**.

## Decisão

O tipo ganha a coluna `icon_name` (VARCHAR, nula). Nula = sem ícone (comportamento de hoje). O valor é
um nome de um **catálogo fechado** (`OCCURRENCE_TYPE_ICON_NAMES`), editável na aba Tipos de
`/ocorrencias`. Painel e app do motorista leem o mesmo valor.

Decidido sem pergunta aberta (custo de reverter entre parênteses):

- **Nome de ícone do design system, não emoji** — os dois apps já têm `<Icon name>` e o traçado é o
  mesmo (ADR-0075 §7); emoji muda de cara por sistema operacional. (trocar o render)
- **Catálogo fechado de 10 nomes**: `alert`, `camera`, `clipboard-list`, `clock`, `document`,
  `invoice`, `message`, `money`, `package`, `truck`. Ampliar é aditivo. (reduzir exige migration de dados)
- **Sem default por tipo existente**: o catálogo de bootstrap não muda; o cliente escolhe na aba Tipos.

## Requisitos

- RF1 `company_occurrence_types.icon_name VARCHAR(32) NULL` com CHECK `icon_name IS NULL OR icon_name IN (…catálogo…)`. Migration aditiva, com rollback.
- RF2 Cadastro (`POST/PUT /company-settings/occurrence-types`): `iconName` opcional; ausente no PUT mantém, `null` limpa, fora do catálogo → `400` com código estável.
- RF3 Leituras que devolvem o tipo (`GET /me/trips/current/occurrence-types`, escritório, resolução de configuração) trazem `iconName: string | null`.
- RF4 Aba Tipos: seletor de ícone (grade de botões com `aria-label`, opção "Sem ícone"), no bloco de identificação do tipo.
- RF5 App do motorista: chip do tipo mostra o ícone antes do nome; sem `iconName`, o chip fica como hoje. Os glyphs do catálogo que faltam em `icon.tsx` entram com o traçado do painel.
- RF6 Painel: cartão da ocorrência (nota e viagem) mostra o ícone ao lado do nome do tipo.
- RF7 Compatibilidade (ADR-0081 §9): painel e app tolerantes primeiro (aceitam `iconName` ausente), depois API, depois telas. Guard do painel é de chave exata — a chave nova entra opcional antes da API publicá-la.

## Fora de escopo

Ícone por contratante, cor por tipo, upload de imagem, emoji.

## Critérios de aceite

- CA1 Tipo sem ícone renderiza exatamente como hoje nas três telas (contrato de snapshot).
- CA2 `iconName` fora do catálogo é recusado na API e a CHECK recusa no banco (integração).
- CA3 Escolher o ícone na aba Tipos e recarregar mostra o mesmo ícone no chip do motorista (smoke).
- CA4 Nenhum nome de tipo no código; o catálogo é lista de nomes de ícone.
