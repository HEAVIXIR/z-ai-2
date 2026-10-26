\set ON_ERROR_STOP on
\echo ''
\echo '===================================================================='
\echo ' HEAVIX Issue #81 — Manual SQL invariants (PostgreSQL 17)'
\echo ' IMPORTANT: These statements do NOT invoke application service routines.'
\echo ' They are schema/SQL checks only, not application-path behavioral proof.'
\echo '===================================================================='

-- Section 0: schema readiness
\echo ''
\echo '--- Section 0: schema readiness ---'
DO $$
DECLARE missing text[];
BEGIN
  SELECT array_agg(t) INTO missing
  FROM (VALUES ('Part'), ('AuditOutbox')) AS expected(t)
  LEFT JOIN information_schema.tables it
    ON it.table_name = expected.t AND it.table_schema = 'public'
  WHERE it.table_name IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 0: missing tables: %', missing;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Part' AND column_name='stock') THEN
    RAISE EXCEPTION 'FAIL 0: Part.stock missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='AuditOutbox' AND column_name='status') THEN
    RAISE EXCEPTION 'FAIL 0: AuditOutbox.status missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='AuditOutbox' AND column_name='attempts') THEN
    RAISE EXCEPTION 'FAIL 0: AuditOutbox.attempts missing';
  END IF;
  RAISE NOTICE 'PASS 0: required tables and columns exist';
END $$;

-- Section 1: SQL stock arithmetic only; this does NOT test refund idempotency.
\echo ''
\echo '--- Section 1: SQL stock arithmetic (not refund idempotency) ---'
BEGIN;
  INSERT INTO "Part" (id, name, sku, "categoryId", "priceUsd", stock, "createdAt", "updatedAt")
  VALUES ('__test_stock_arithmetic', 'Test Stock Arithmetic', 'TEST-STOCK-ARITH-001', 'cat-test', 10.0, 10, now(), now())
  ON CONFLICT (id) DO UPDATE SET stock = 10, "updatedAt" = now();
  UPDATE "Part" SET stock = stock + 3, "updatedAt" = now() WHERE id = '__test_stock_arithmetic';
  DO $$ DECLARE s int; BEGIN
    SELECT stock INTO s FROM "Part" WHERE id = '__test_stock_arithmetic';
    IF s <> 13 THEN RAISE EXCEPTION 'FAIL 1: expected stock 13, got %', s; END IF;
    RAISE NOTICE 'PASS 1: direct SQL stock arithmetic produced 13';
  END $$;
ROLLBACK;
\echo 'PASS 1: direct SQL arithmetic transaction rolled back; no idempotency claim';

-- Section 2: SQL transaction rollback only; this does NOT invoke the application mutation path.
\echo ''
\echo '--- Section 2: direct SQL rollback invariant ---'
BEGIN;
  INSERT INTO "Part" (id, name, sku, "categoryId", "priceUsd", stock, "createdAt", "updatedAt")
  VALUES ('__test_tx', 'Test TX Part', 'TEST-TX-001', 'cat-test', 5.0, 5, now(), now());
  INSERT INTO "AuditOutbox" (id, "payloadJson", status, attempts, "createdAt", "updatedAt")
  VALUES ('outbox-tx-1', '{"event":"part.created","partId":"__test_tx"}', 'PENDING', 0, now(), now());
ROLLBACK;
DO $$ DECLARE p_c int; o_c int; BEGIN
  SELECT count(*) INTO p_c FROM "Part" WHERE id = '__test_tx';
  SELECT count(*) INTO o_c FROM "AuditOutbox" WHERE id = 'outbox-tx-1';
  IF p_c <> 0 OR o_c <> 0 THEN RAISE EXCEPTION 'FAIL 2: rows remain after rollback (Part %, Outbox %)', p_c, o_c; END IF;
  RAISE NOTICE 'PASS 2: direct SQL rows absent after rollback';
END $$;

-- Section 3: direct SQL status/lease transitions using the application's status vocabulary.
-- This simulates database predicates; it does NOT call drainAuditOutbox().
\echo ''
\echo '--- Section 3: direct SQL PROCESSING to DELIVERED transition ---'
DO $$
DECLARE row_id text; s text; a int;
BEGIN
  INSERT INTO "AuditOutbox" (id, "payloadJson", status, attempts, "createdAt", "updatedAt")
  VALUES ('__drain_test', '{"event":"test.drain"}', 'PENDING', 0, now(), now())
  ON CONFLICT (id) DO UPDATE SET status='PENDING', attempts=0, "lockedAt"=NULL, "updatedAt"=now();
  UPDATE "AuditOutbox" SET status='PROCESSING', "lockedAt"=now(), "updatedAt"=now()
    WHERE id='__drain_test' AND status='PENDING';
  SELECT status, attempts INTO s, a FROM "AuditOutbox" WHERE id='__drain_test';
  IF s <> 'PROCESSING' OR a <> 0 THEN RAISE EXCEPTION 'FAIL 3a: expected PROCESSING/0, got %/%', s, a; END IF;
  UPDATE "AuditOutbox" SET status='DELIVERED', "lockedAt"=NULL, "updatedAt"=now()
    WHERE id='__drain_test' AND status='PROCESSING';
  SELECT status INTO s FROM "AuditOutbox" WHERE id='__drain_test';
  IF s <> 'DELIVERED' THEN RAISE EXCEPTION 'FAIL 3b: expected DELIVERED, got %', s; END IF;
  DELETE FROM "AuditOutbox" WHERE id='__drain_test';
  RAISE NOTICE 'PASS 3: direct SQL status transition PENDING -> PROCESSING -> DELIVERED';
END $$;

-- Section 4: direct SQL stale lease predicate using PROCESSING (application status).
\echo ''
\echo '--- Section 4: stale lease predicate ---'
DO $$
BEGIN
  INSERT INTO "AuditOutbox" (id, "payloadJson", status, attempts, "lockedAt", "createdAt", "updatedAt")
  VALUES ('__stale_lease', '{"event":"stale"}', 'PROCESSING', 0, now() - interval '5 minutes', now(), now()),
         ('__active_lease', '{"event":"active"}', 'PROCESSING', 0, now() + interval '5 minutes', now(), now())
  ON CONFLICT (id) DO NOTHING;
  UPDATE "AuditOutbox" SET "lockedAt"=now()+interval '2 minutes', "updatedAt"=now()
    WHERE status='PROCESSING' AND ("lockedAt" IS NULL OR "lockedAt" < now())
      AND id IN ('__stale_lease','__active_lease');
  PERFORM 1 FROM "AuditOutbox"
    WHERE id='__stale_lease' AND "lockedAt" IS NOT NULL AND "lockedAt" > now()+interval '1 minute';
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL 4a: stale lease predicate did not reclaim stale row'; END IF;
  PERFORM 1 FROM "AuditOutbox"
    WHERE id='__active_lease' AND "lockedAt" > now()+interval '3 minutes';
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL 4b: active lease was modified'; END IF;
  DELETE FROM "AuditOutbox" WHERE id IN ('__stale_lease','__active_lease');
  RAISE NOTICE 'PASS 4: direct SQL stale lease predicate selected stale row only';
END $$;

-- Section 5 intentionally omitted: sink idempotency is enforced in the Main DB
-- AuditLog.idempotencyKey UNIQUE constraint and must be tested via the real app path.
-- Do NOT infer an eventHash field/index; the Store schema has no eventHash field.

-- Section 6: direct SQL retry/dead-letter predicates; not the application retry routine.
\echo ''
\echo '--- Section 6: direct SQL retry/dead-letter predicates ---'
DO $$
DECLARE s text; a int;
BEGIN
  INSERT INTO "AuditOutbox" (id, "payloadJson", status, attempts, "createdAt", "updatedAt")
  VALUES ('__fail_test', '{"event":"failed"}', 'FAILED', 2, now(), now())
  ON CONFLICT (id) DO UPDATE SET status='FAILED', attempts=2, "updatedAt"=now();
  UPDATE "AuditOutbox" SET status='PENDING', attempts=attempts+1, "updatedAt"=now()
    WHERE id='__fail_test' AND attempts < 5 AND status='FAILED';
  SELECT status, attempts INTO s, a FROM "AuditOutbox" WHERE id='__fail_test';
  IF s <> 'PENDING' OR a <> 3 THEN RAISE EXCEPTION 'FAIL 6a: expected PENDING/3, got %/%', s, a; END IF;
  UPDATE "AuditOutbox" SET attempts=5, status='FAILED', "updatedAt"=now() WHERE id='__fail_test';
  UPDATE "AuditOutbox" SET status='PENDING', attempts=attempts+1, "updatedAt"=now()
    WHERE id='__fail_test' AND attempts < 5 AND status='FAILED';
  SELECT status, attempts INTO s, a FROM "AuditOutbox" WHERE id='__fail_test';
  IF s <> 'FAILED' OR a <> 5 THEN RAISE EXCEPTION 'FAIL 6b: max-attempt row was retried (status %, attempts %)', s, a; END IF;
  DELETE FROM "AuditOutbox" WHERE id='__fail_test';
  RAISE NOTICE 'PASS 6: direct SQL retry/dead-letter predicates';
END $$;

-- Section 7: migration history exists; this does not prove backup/restore.
\echo ''
\echo '--- Section 7: migration history ---'
DO $$
DECLARE m_count int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='_prisma_migrations' AND table_schema='public') THEN
    RAISE EXCEPTION 'FAIL 7: _prisma_migrations missing';
  END IF;
  SELECT count(*) INTO m_count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;
  IF m_count < 1 THEN RAISE EXCEPTION 'FAIL 7: no finished migrations'; END IF;
  RAISE NOTICE 'PASS 7: _prisma_migrations present with % finished migration(s)', m_count;
END $$;

\echo ''
\echo '===================================================================='
\echo ' Manual SQL checks complete. These are NOT application-path tests.'
\echo ' Verify the real integration tests separately on the exact commit.'
\echo '===================================================================='
