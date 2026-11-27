select manga_id, added_at, completed_at
from {{ ref('slv_manga_current') }}
where completed_at is not null
  and added_at is not null
  and completed_at < added_at - interval '1 minute'
