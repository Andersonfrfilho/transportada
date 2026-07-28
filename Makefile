SHELL := /bin/sh
.DEFAULT_GOAL := help

ENV_FILE ?= $(if $(wildcard .env),.env,.env.example)
PROJECT_NAME := $(shell sed -n 's/^PROJECT_NAME=//p' $(ENV_FILE) 2>/dev/null)
APP_ENV := $(shell sed -n 's/^APP_ENV=//p' $(ENV_FILE) 2>/dev/null)
COMPOSE_PROJECT_NAME := $(PROJECT_NAME)-$(APP_ENV)
BUN_VERSION := 1.3.14
FRONTEND_PORT := $(or $(shell sed -n 's/^FRONTEND_PORT=//p' $(ENV_FILE) 2>/dev/null),53000)
FRONTEND_ORIGIN := $(shell sed -n 's/^FRONTEND_ORIGIN=//p' $(ENV_FILE) 2>/dev/null)
API_PORT := $(or $(shell sed -n 's/^APP_PORT=//p' $(ENV_FILE) 2>/dev/null),53001)
WORKER_PORT := $(or $(shell sed -n 's/^WORKER_PORT=//p' $(ENV_FILE) 2>/dev/null),53002)
KEYCLOAK_PORT := $(or $(shell sed -n 's/^KEYCLOAK_PORT=//p' $(ENV_FILE) 2>/dev/null),58080)
KEYCLOAK_MANAGEMENT_PORT := $(or $(shell sed -n 's/^KEYCLOAK_MANAGEMENT_PORT=//p' $(ENV_FILE) 2>/dev/null),59002)
KEYCLOAK_REALM := $(or $(shell sed -n 's/^KEYCLOAK_REALM=//p' $(ENV_FILE) 2>/dev/null),transportada-local)
KEYCLOAK_ISSUER := $(shell sed -n 's/^KEYCLOAK_ISSUER=//p' $(ENV_FILE) 2>/dev/null)
KEYCLOAK_JWKS_URI := $(shell sed -n 's/^KEYCLOAK_JWKS_URI=//p' $(ENV_FILE) 2>/dev/null)
KEYCLOAK_AUDIENCE := $(shell sed -n 's/^KEYCLOAK_AUDIENCE=//p' $(ENV_FILE) 2>/dev/null)
KEYCLOAK_ADMIN_USERNAME := $(shell sed -n 's/^KEYCLOAK_ADMIN_USERNAME=//p' $(ENV_FILE) 2>/dev/null)
KEYCLOAK_ADMIN_PASSWORD := $(shell sed -n 's/^KEYCLOAK_ADMIN_PASSWORD=//p' $(ENV_FILE) 2>/dev/null)
KEYCLOAK_LOCAL_USER_PASSWORD := $(shell sed -n 's/^KEYCLOAK_LOCAL_USER_PASSWORD=//p' $(ENV_FILE) 2>/dev/null)
ENCRYPTION_ACTIVE_KEY_ID := $(shell sed -n 's/^ENCRYPTION_ACTIVE_KEY_ID=//p' $(ENV_FILE) 2>/dev/null)
DATABASE_URL := $(shell sed -n 's/^DATABASE_URL=//p' $(ENV_FILE) 2>/dev/null)
RABBITMQ_URL := $(shell sed -n 's/^RABBITMQ_URL=//p' $(ENV_FILE) 2>/dev/null)
COMPOSE_BASE := docker compose --env-file $(ENV_FILE) -p $(COMPOSE_PROJECT_NAME)
COMPOSE := KEYCLOAK_PORT=$(KEYCLOAK_PORT) KEYCLOAK_MANAGEMENT_PORT=$(KEYCLOAK_MANAGEMENT_PORT) $(COMPOSE_BASE)
E2E_ENV_FILE ?= .env.test

.PHONY: help bootstrap e2e-bootstrap test-bootstrap realm-contract config postgres-up identity-bootstrap up down ps dev check migration-test smoke e2e-up e2e-down e2e-ps test-up test-down test-ps worker-integration test-worker-integration

help: ## 📚 Lista os comandos disponíveis
	@sed -n 's/^\([a-z][a-z-]*\):.*## \(.*\)$$/\1\t\2/p' $(MAKEFILE_LIST)

bootstrap: ## 🧰 Prepara o .env e instala com Bun congelado
	@test -f .env || cp .env.example .env
	@bun install --frozen-lockfile

e2e-bootstrap: ## 🧪 Prepara o ambiente dedicado de E2E a partir do exemplo versionado
	@test -f $(E2E_ENV_FILE) || cp .env.test.example $(E2E_ENV_FILE)

test-bootstrap: e2e-bootstrap ## 🧪 Alias compatível para preparar o ambiente dedicado de E2E

realm-contract: ## 🪪 Valida o contrato versionado do realm Keycloak local
	@bun test test/keycloak-realm.contract.test.ts

config: realm-contract ## 🔎 Valida o Docker Compose com o nome do projeto
	@test -n "$(PROJECT_NAME)"
	@test -n "$(APP_ENV)"
	@test -n "$(DATABASE_URL)"
	@test -n "$(RABBITMQ_URL)"
	@test -n "$(FRONTEND_ORIGIN)"
	@test -n "$(KEYCLOAK_PORT)"
	@test -n "$(KEYCLOAK_MANAGEMENT_PORT)"
	@test -n "$(KEYCLOAK_REALM)"
	@test -n "$(KEYCLOAK_ISSUER)"
	@test -n "$(KEYCLOAK_JWKS_URI)"
	@test -n "$(KEYCLOAK_AUDIENCE)"
	@test -n "$(KEYCLOAK_ADMIN_USERNAME)"
	@test -n "$(KEYCLOAK_ADMIN_PASSWORD)"
	@test -n "$(KEYCLOAK_LOCAL_USER_PASSWORD)"
	@test -n "$(ENCRYPTION_ACTIVE_KEY_ID)"
	@grep -q '^ENCRYPTION_KEYRING_JSON=.' "$(ENV_FILE)"
	@grep -q '^IDEMPOTENCY_HMAC_KEY=.' "$(ENV_FILE)"
	@set -a; . "./$(ENV_FILE)"; set +a; \
		bun -e 'import { parseEnvironment } from "./apps/api-transportada/src/config/environment.schema.ts"; parseEnvironment(process.env)'
	@test "$$(bun --version)" = "$(BUN_VERSION)"
	@test "$(COMPOSE_PROJECT_NAME)" = "$(PROJECT_NAME)-$(APP_ENV)"
	@$(COMPOSE) config --quiet

postgres-up: ## 🐘 Sobe somente o PostgreSQL local para migrations
	@test -n "$(PROJECT_NAME)"
	@test -n "$(APP_ENV)"
	@test -n "$(DATABASE_URL)"
	@test "$$(bun --version)" = "$(BUN_VERSION)"
	@test "$(COMPOSE_PROJECT_NAME)" = "$(PROJECT_NAME)-$(APP_ENV)"
	@KEYCLOAK_PORT=$(KEYCLOAK_PORT) \
		KEYCLOAK_MANAGEMENT_PORT=$(KEYCLOAK_MANAGEMENT_PORT) \
		KEYCLOAK_ADMIN_USERNAME=not-used \
		KEYCLOAK_ADMIN_PASSWORD=not-used \
		KEYCLOAK_LOCAL_USER_PASSWORD=not-used \
		$(COMPOSE_BASE) up -d --wait postgres

identity-bootstrap: postgres-up realm-contract ## 🪪 Migra e cria a identidade local da aplicação
	@$(COMPOSE) up -d --wait --force-recreate keycloak
	@set -a; . "./$(ENV_FILE)"; set +a; \
		APP_ENV="$(APP_ENV)" PROJECT_NAME="$(PROJECT_NAME)" \
		bun run --cwd apps/api-transportada db:migrate && \
		APP_ENV="$(APP_ENV)" PROJECT_NAME="$(PROJECT_NAME)" \
		bun run --cwd apps/api-transportada db:seed:local

up: config ## 🚀 Sobe PostgreSQL, RabbitMQ, MinIO, Mailpit e Keycloak
	@$(COMPOSE) up -d --remove-orphans --wait $(SERVICES)

down: config ## 🛑 Encerra a infraestrutura local
	@$(COMPOSE) down

ps: config ## 📋 Exibe os serviços locais
	@$(COMPOSE) ps $(SERVICES)

dev: identity-bootstrap up ## 💻 Inicia somente frontend, API e worker Bun
	@set -a; . "./$(ENV_FILE)"; set +a; \
		export FRONTEND_PORT="$(FRONTEND_PORT)"; \
		export QUEUE_PREFIX="$(PROJECT_NAME)_$(APP_ENV)"; \
		bun run --cwd apps/api-transportada dev & api_process_id=$$!; \
		bun run --cwd apps/worker-transportada dev & worker_process_id=$$!; \
		bun run --cwd apps/frontend-transportada dev & frontend_process_id=$$!; \
		cleanup() { \
			trap - INT TERM EXIT; \
			kill $$api_process_id $$worker_process_id $$frontend_process_id 2>/dev/null || true; \
		}; \
		trap 'cleanup; exit 130' INT TERM; \
		trap cleanup EXIT; \
		wait

check: config ## ✅ Executa todos os gates locais
	@bun run check

migration-test: postgres-up ## 🗃️ Valida migration e rollback em PostgreSQL descartável
	@set -a; . "./$(ENV_FILE)"; set +a; \
		DRIZZLE_TEST_DATABASE_URL="$$DATABASE_URL" \
		bun run --cwd apps/api-transportada db:test

smoke: config ## 🩺 Valida a stack local já iniciada
	@check_url() { \
		url="$$1"; \
		for attempt in $$(seq 1 60); do \
			if curl --fail --silent --show-error --output /dev/null "$$url"; then \
				return 0; \
			fi; \
			if [ "$$attempt" -eq 60 ]; then \
				return 1; \
			fi; \
			sleep 1; \
		done; \
	}; \
	check_url "http://localhost:$(FRONTEND_PORT)/"; \
	check_url "http://localhost:$(FRONTEND_PORT)/manifest.webmanifest"; \
	check_url "http://localhost:$(API_PORT)/health/live"; \
	check_url "http://localhost:$(API_PORT)/health/ready"; \
	check_url "http://localhost:$(WORKER_PORT)/health/live"; \
	check_url "http://localhost:$(WORKER_PORT)/health/ready"; \
	check_url "http://localhost:59000/minio/health/live"; \
	check_url "http://localhost:58025/livez"; \
	check_url "http://localhost:$(KEYCLOAK_MANAGEMENT_PORT)/health/ready"; \
	check_url "http://localhost:$(KEYCLOAK_PORT)/realms/$(KEYCLOAK_REALM)/.well-known/openid-configuration"
	@set -a; . "./$(ENV_FILE)"; set +a; \
		PLAYWRIGHT_FRONTEND_PORT="$${PLAYWRIGHT_FRONTEND_PORT:-53100}" \
		PLAYWRIGHT_REUSE_EXISTING_FRONTEND_SERVER=false \
		PLAYWRIGHT_REUSE_EXISTING_API_SERVER=true \
		bun run --cwd apps/frontend-transportada smoke

e2e-up: e2e-bootstrap ## 🧪 Sobe somente PostgreSQL, RabbitMQ e MinIO do ambiente dedicado de E2E
	@ENV_FILE=$(E2E_ENV_FILE) SERVICES="postgres rabbitmq minio" $(MAKE) up

test-up: e2e-up ## 🧪 Alias compatível para subir a infraestrutura dedicada de E2E

e2e-down: e2e-bootstrap ## 🧪 Encerra a infraestrutura dedicada de E2E
	@ENV_FILE=$(E2E_ENV_FILE) $(MAKE) down

test-down: e2e-down ## 🧪 Alias compatível para encerrar a infraestrutura dedicada de E2E

e2e-ps: e2e-bootstrap ## 🧪 Exibe os serviços do ambiente dedicado de E2E
	@ENV_FILE=$(E2E_ENV_FILE) $(MAKE) ps

test-ps: e2e-ps ## 🧪 Alias compatível para exibir os serviços do ambiente dedicado de E2E

worker-integration: bootstrap ## 🧪 Roda a integração comum do worker usando o ambiente local
	@SERVICES="postgres rabbitmq minio" $(MAKE) up
	@set -a; . "./$(ENV_FILE)"; set +a; \
		worker_database="$$(bun apps/worker-transportada/scripts/provision-integration-database.ts)"; \
		worker_database_url="$${DATABASE_URL%/*}/$$worker_database"; \
		DATABASE_URL="$$worker_database_url" \
		bun run --cwd apps/api-transportada db:migrate && \
		DATABASE_URL="$$worker_database_url" \
		RABBITMQ_TEST_URL="$${RABBITMQ_TEST_URL:-$$RABBITMQ_URL}" \
		bun run --cwd apps/worker-transportada test:integration

test-worker-integration: worker-integration ## 🧪 Alias compatível para integração comum do worker no ambiente local
