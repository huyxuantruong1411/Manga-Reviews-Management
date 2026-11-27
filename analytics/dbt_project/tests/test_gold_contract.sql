-- Verify Gold statistical safeguards and anti-leakage guarantees:
-- 1. Immature backlog cohorts must never report non-null completion rate.
select 'immature_cohort_leak' as err, mart_row_key
from {{ ref('gld_backlog_velocity') }}
where not is_cohort_matured and cohort_completion_rate is not null

union all

-- 2. Tag synergy must never include self-pairs or duplicate unordered pairs.
select 'self_tag_pair' as err, mart_row_key
from {{ ref('gld_tag_synergy') }}
where tag_id_a >= tag_id_b

union all

-- 3. Taste calibration shrunk mean must stay bounded between raw mean and global mean (inclusive).
select 'shrinkage_out_of_bounds' as err, mart_row_key
from {{ ref('gld_taste_calibration') }}
where rated_manga_count > 0
  and (
      shrunk_mean_personal_rating < least(raw_mean_personal_rating, global_baseline_mean) - 1e-9
      or shrunk_mean_personal_rating > greatest(raw_mean_personal_rating, global_baseline_mean) + 1e-9
  )
