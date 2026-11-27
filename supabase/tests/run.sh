#!/bin/sh
# Roda a migration e os testes num Postgres local (porta 5433, socket /tmp).
set -e
cd "$(dirname "$0")/.."
psql -h /tmp -p 5433 -U postgres -qc "drop database if exists bankmar_test" -c "create database bankmar_test"
psql -v ON_ERROR_STOP=1 -h /tmp -p 5433 -U postgres -d bankmar_test -q \
  -f tests/00_stub_supabase.sql -f migrations/20261125000000_entrega1.sql -f migrations/20261125010000_corrige_digest.sql -f migrations/20261125020000_permissoes.sql -f migrations/20261126000000_investimentos.sql -f migrations/20261126010000_cotacoes_ao_vivo.sql -f migrations/20261127000000_cartoes_milhas.sql -f migrations/20261127010000_imposto_renda.sql -f migrations/20261127020000_integracao_ir.sql -f tests/01_entrega1_test.sql
