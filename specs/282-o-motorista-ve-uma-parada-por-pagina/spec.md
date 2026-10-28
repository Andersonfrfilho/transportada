# 282 — O motorista vê uma parada por página

Pedido de um motorista, repassado por Anderson em 27/10/2026: ao tocar "Iniciar rota"/"Cheguei" a
tela deveria ficar fixa no cliente, sem a barra de rolagem levar a outras paradas. Decisão de Anderson:
uma **configuração do motorista** entre "uma parada por página" (com Anterior/Próxima) e a lista de hoje.

## Requisitos

- RF1: no Perfil, a seção "Paradas" escolhe `Uma parada por página` (padrão) ou `Lista de paradas`;
  a escolha fica no aparelho (`localStorage`, chave `transportada-driver:stop-view-mode`).
- RF2: no modo página, a tela mostra só uma parada, com "Parada i de N", botões Anterior/Próxima e
  "Ver todas (N)". A página inicial é a parada atual (a caminho ou a primeira pendente; a última se
  tudo foi resolvido).
- RF3: navegar com Anterior/Próxima vale até a parada atual mudar; aí a tela volta à parada atual.
- RF4: "Ver todas" mostra a lista até a parada atual mudar; "Voltar à parada" volta antes disso.
  Busca preenchida sempre mostra a lista. O atalho "Ir para a parada N" navega a página.
- RF5: tudo é derivado do estado local do aparelho — funciona sem sinal, sem `useEffect` de sincronia.
- RF6: o modo lista é exatamente o comportamento anterior.

## Fora do escopo

Preferência por empresa/servidor; animação de troca de página.
