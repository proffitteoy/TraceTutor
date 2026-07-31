-- Reference queries for maintainers. Runtime queries live in apps/api.
SELECT
    id,
    title,
    question_type,
    difficulty_level,
    knowledge_points,
    methods
FROM active_question_summary
ORDER BY difficulty_level, title;

SELECT
    q.id,
    q.title,
    kp.name AS shared_knowledge_point,
    qkp.role,
    qkp.weight
FROM question_knowledge_point base
JOIN question_knowledge_point qkp
  ON qkp.knowledge_point_id = base.knowledge_point_id
 AND qkp.question_id <> base.question_id
JOIN question_asset q
  ON q.id = qkp.question_id
 AND q.status = 'active'
JOIN knowledge_point kp
  ON kp.id = qkp.knowledge_point_id
WHERE base.question_id = '60000000-0000-0000-0000-000000000001'
ORDER BY qkp.weight DESC, q.difficulty_level;

SELECT DISTINCT
    candidate.id,
    candidate.title,
    candidate.difficulty_level,
    kp.name AS shared_knowledge_point,
    candidate_method.name AS candidate_primary_method
FROM question_asset base_question
JOIN question_knowledge_point base_kp
  ON base_kp.question_id = base_question.id
JOIN question_knowledge_point candidate_kp
  ON candidate_kp.knowledge_point_id = base_kp.knowledge_point_id
 AND candidate_kp.question_id <> base_question.id
JOIN question_asset candidate
  ON candidate.id = candidate_kp.question_id
 AND candidate.status = 'active'
JOIN knowledge_point kp
  ON kp.id = candidate_kp.knowledge_point_id
JOIN question_method candidate_qm
  ON candidate_qm.question_id = candidate.id
 AND candidate_qm.role = 'primary'
JOIN method_asset candidate_method
  ON candidate_method.id = candidate_qm.method_id
WHERE base_question.id = '60000000-0000-0000-0000-000000000001'
  AND NOT EXISTS (
      SELECT 1
      FROM question_method base_qm
      WHERE base_qm.question_id = base_question.id
        AND base_qm.role = 'primary'
        AND base_qm.method_id = candidate_qm.method_id
  )
ORDER BY candidate.difficulty_level, candidate.title;

SELECT DISTINCT
    a.id AS question_a_id,
    a.title AS question_a,
    b.id AS question_b_id,
    b.title AS question_b,
    m.name AS shared_method
FROM question_method am
JOIN question_method bm
  ON bm.method_id = am.method_id
 AND bm.question_id > am.question_id
JOIN question_asset a
  ON a.id = am.question_id
 AND a.status = 'active'
JOIN question_asset b
  ON b.id = bm.question_id
 AND b.status = 'active'
JOIN method_asset m
  ON m.id = am.method_id
WHERE NOT EXISTS (
    SELECT 1
    FROM question_knowledge_point ak
    JOIN question_knowledge_point bk
      ON bk.knowledge_point_id = ak.knowledge_point_id
     AND bk.question_id = b.id
    WHERE ak.question_id = a.id
)
ORDER BY a.title, b.title;

SELECT
    candidate.id,
    candidate.title,
    candidate.difficulty_level,
    feature.structure_code
FROM question_structure_feature base_feature
JOIN question_structure_feature feature
  ON feature.structure_code = base_feature.structure_code
 AND feature.question_id <> base_feature.question_id
JOIN question_asset candidate
  ON candidate.id = feature.question_id
 AND candidate.status = 'active'
WHERE base_feature.question_id =
    '60000000-0000-0000-0000-000000000001'
ORDER BY candidate.difficulty_level;

SELECT
    edge.target_question_id,
    q.title,
    count(*) AS matched_channels,
    round(avg(edge.score), 4) AS average_score,
    jsonb_agg(
        jsonb_build_object(
            'type', edge.similarity_type,
            'score', edge.score,
            'reason', edge.reason
        )
        ORDER BY edge.score DESC
    ) AS evidence
FROM question_similarity_edge edge
JOIN question_asset q
  ON q.id = edge.target_question_id
 AND q.status = 'active'
WHERE edge.source_question_id =
    '60000000-0000-0000-0000-000000000001'
  AND edge.status = 'active'
GROUP BY edge.target_question_id, q.title
ORDER BY matched_channels DESC, average_score DESC;

SELECT
    q.id,
    q.title,
    q.stem,
    q.question_type,
    q.difficulty_level,
    answer.answer_text,
    solution.solution_text,
    COALESCE(steps.items, '[]'::jsonb) AS solution_steps,
    COALESCE(knowledge.items, '[]'::jsonb) AS knowledge_points,
    COALESCE(methods.items, '[]'::jsonb) AS methods
FROM question_asset q
LEFT JOIN answer_asset answer
  ON answer.question_id = q.id
 AND answer.is_primary
LEFT JOIN solution_asset solution
  ON solution.question_id = q.id
 AND solution.is_primary
LEFT JOIN LATERAL (
    SELECT jsonb_agg(
        jsonb_build_object(
            'order', step_order,
            'title', step_title,
            'text', step_text,
            'formula', formula_text
        )
        ORDER BY step_order
    ) AS items
    FROM solution_step
    WHERE solution_id = solution.id
) steps ON true
LEFT JOIN LATERAL (
    SELECT jsonb_agg(
        jsonb_build_object(
            'code', kp.code,
            'name', kp.name,
            'role', qkp.role,
            'weight', qkp.weight
        )
        ORDER BY qkp.weight DESC
    ) AS items
    FROM question_knowledge_point qkp
    JOIN knowledge_point kp
      ON kp.id = qkp.knowledge_point_id
    WHERE qkp.question_id = q.id
) knowledge ON true
LEFT JOIN LATERAL (
    SELECT jsonb_agg(
        jsonb_build_object(
            'code', m.code,
            'name', m.name,
            'role', qm.role,
            'weight', qm.weight
        )
        ORDER BY qm.weight DESC
    ) AS items
    FROM question_method qm
    JOIN method_asset m
      ON m.id = qm.method_id
    WHERE qm.question_id = q.id
) methods ON true
WHERE q.id = '60000000-0000-0000-0000-000000000003';

SELECT *
FROM question_review_queue
ORDER BY created_at;
