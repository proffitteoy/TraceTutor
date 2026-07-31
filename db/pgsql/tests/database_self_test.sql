-- Run after migrations and development seeds.
DO $$
DECLARE
    expected_tables text[] := ARRAY[
        'subject_domain',
        'source_asset',
        'knowledge_point',
        'method_asset',
        'question_asset',
        'question_version',
        'answer_asset',
        'solution_asset',
        'solution_step',
        'question_knowledge_point',
        'question_method',
        'question_similarity_edge',
        'question_structure_feature',
        'question_embedding',
        'question_variant_edge',
        'asset_review_log',
        'import_batch',
        'staging_question_raw'
    ];
    existing_count integer;
    invalid_count integer;
    activation_rejected boolean := false;
    activation_error text;
BEGIN
    SELECT count(*)
    INTO existing_count
    FROM unnest(expected_tables) AS item(table_name)
    WHERE to_regclass(current_schema() || '.' || item.table_name) IS NOT NULL;

    IF existing_count <> cardinality(expected_tables) THEN
        RAISE EXCEPTION 'table_check_failed: expected %, found %',
            cardinality(expected_tables), existing_count;
    END IF;

    SELECT count(*)
    INTO existing_count
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND (
          (table_name = 'question_asset' AND column_name = 'id')
          OR (table_name = 'knowledge_point' AND column_name = 'id')
          OR (table_name = 'method_asset' AND column_name = 'id')
          OR (
              table_name = 'question_similarity_edge'
              AND column_name IN ('source_question_id', 'target_question_id')
          )
      );

    SELECT count(*)
    INTO invalid_count
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND (
          (table_name = 'question_asset' AND column_name = 'id')
          OR (table_name = 'knowledge_point' AND column_name = 'id')
          OR (table_name = 'method_asset' AND column_name = 'id')
          OR (
              table_name = 'question_similarity_edge'
              AND column_name IN ('source_question_id', 'target_question_id')
          )
      )
      AND data_type = 'uuid';

    IF existing_count <> 5 OR invalid_count <> 5 THEN
        RAISE EXCEPTION 'uuid_type_check_failed: expected 5 uuid columns';
    END IF;

    SELECT count(*)
    INTO existing_count
    FROM question_asset
    WHERE id BETWEEN
        '60000000-0000-0000-0000-000000000001'::uuid
        AND '60000000-0000-0000-0000-000000000012'::uuid
      AND status = 'active';

    IF existing_count <> 12 THEN
        RAISE EXCEPTION 'demo_question_check_failed: expected 12, found %',
            existing_count;
    END IF;

    SELECT count(*)
    INTO invalid_count
    FROM question_asset q
    WHERE q.status = 'active'
      AND (
          NOT EXISTS (
              SELECT 1
              FROM answer_asset a
              WHERE a.question_id = q.id
                AND a.is_primary
          )
          OR NOT EXISTS (
              SELECT 1
              FROM solution_asset s
              WHERE s.question_id = q.id
                AND s.is_primary
                AND s.status IN ('reviewed', 'active')
          )
          OR NOT EXISTS (
              SELECT 1
              FROM asset_review_log r
              WHERE r.asset_type = 'question'
                AND r.asset_id = q.id
                AND r.review_status = 'approved'
          )
      );

    IF invalid_count <> 0 THEN
        RAISE EXCEPTION 'active_question_integrity_failed: % row(s)',
            invalid_count;
    END IF;

    SELECT count(*)
    INTO invalid_count
    FROM active_question_summary summary
    JOIN question_asset q ON q.id = summary.id
    WHERE q.status <> 'active';

    IF invalid_count <> 0 THEN
        RAISE EXCEPTION 'active_question_view_failed';
    END IF;

    SELECT count(*)
    INTO invalid_count
    FROM question_similarity_edge
    WHERE source_question_id = target_question_id;

    IF invalid_count <> 0 THEN
        RAISE EXCEPTION 'similarity_self_edge_failed';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM question_knowledge_point ak
        JOIN question_knowledge_point bk
          ON bk.knowledge_point_id = ak.knowledge_point_id
         AND bk.question_id <> ak.question_id
        WHERE NOT EXISTS (
            SELECT 1
            FROM question_method am
            JOIN question_method bm
              ON bm.method_id = am.method_id
             AND bm.question_id = bk.question_id
            WHERE am.question_id = ak.question_id
              AND am.role = 'primary'
              AND bm.role = 'primary'
        )
    ) THEN
        RAISE EXCEPTION 'same_knowledge_different_method_check_failed';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM question_method am
        JOIN question_method bm
          ON bm.method_id = am.method_id
         AND bm.question_id <> am.question_id
        WHERE NOT EXISTS (
            SELECT 1
            FROM question_knowledge_point ak
            JOIN question_knowledge_point bk
              ON bk.knowledge_point_id = ak.knowledge_point_id
             AND bk.question_id = bm.question_id
            WHERE ak.question_id = am.question_id
        )
    ) THEN
        RAISE EXCEPTION 'same_method_different_knowledge_check_failed';
    END IF;

    BEGIN
        INSERT INTO question_asset (
            stem, question_type, difficulty_level, status, origin_type
        ) VALUES (
            '数据库自检临时题-' || gen_random_uuid()::text,
            'calculation',
            1,
            'active',
            'human_curated'
        );
    EXCEPTION
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS activation_error = MESSAGE_TEXT;
            activation_rejected :=
                activation_error = 'active_question_requires_primary_answer';
    END;

    IF NOT activation_rejected THEN
        RAISE EXCEPTION 'activation_trigger_check_failed: %',
            coalesce(activation_error, 'insert_was_not_rejected');
    END IF;

    RAISE NOTICE 'PostgreSQL database self-test passed';
END;
$$;
