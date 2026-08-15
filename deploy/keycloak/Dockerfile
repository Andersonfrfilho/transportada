# syntax=docker/dockerfile:1
# Imagem própria em vez do container cru: o `kc.sh build` fica no build da imagem, não no boot,
# e o realm entra versionado no git em vez de ser configurado à mão em cada ambiente.
FROM quay.io/keycloak/keycloak:26.5.2@sha256:fb31a59deb46f746f2aaa25adc5da39ceccac4fd22d36a519562b0bf02e8df20 AS build
ENV KC_DB=postgres
ENV KC_HEALTH_ENABLED=true
ENV KC_METRICS_ENABLED=true
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.5.2@sha256:fb31a59deb46f746f2aaa25adc5da39ceccac4fd22d36a519562b0bf02e8df20 AS runtime
COPY --from=build /opt/keycloak/ /opt/keycloak/
# O import resolve ${VAR} pelo ambiente e ignora realm já existente: reimportar não sobrescreve nada.
COPY deploy/keycloak/realm.json /opt/keycloak/data/import/realm.json
# O tema de login carrega a identidade do app na única tela que aparece antes da sessão existir.
COPY deploy/keycloak/theme /opt/keycloak/themes/transportada

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized", "--import-realm"]
