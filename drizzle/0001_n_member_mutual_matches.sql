DROP VIEW "public"."v_mutual_matches";--> statement-breakpoint
CREATE VIEW "public"."v_mutual_matches" AS (
  SELECT a.cluster_id, a.search_id, a.household_id, a.matched_at
  FROM (
    SELECT
      sw.cluster_id,
      sw.search_id,
      s.household_id,
      COUNT(DISTINCT sw.user_id) AS agree_count,
      MAX(sw.created_at) AS matched_at
    FROM swipes sw
    JOIN searches s ON s.id = sw.search_id
    WHERE sw.outcome IN ('keep','shortlist')
    GROUP BY sw.cluster_id, sw.search_id, s.household_id
  ) a
  JOIN (
    SELECT household_id, COUNT(*) AS member_count
    FROM household_members
    GROUP BY household_id
  ) m ON m.household_id = a.household_id
  WHERE a.agree_count = m.member_count
);