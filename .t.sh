export PATH="$HOME/.bun/bin:$PATH"
cd ~/personal/transportada-wt/spec-248/apps/api-transportada
timeout 580 bun --env-file=../../.env.test test --timeout 120000 ./test/database-migration.contract.test.ts -t "preserves baseline" 2>&1 | grep -v "^\s*at " | grep -B30 "(fail)" | head -50
