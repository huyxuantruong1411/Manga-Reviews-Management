select source, source_work_id, source_review_id
from {{ ref('slv_external_review_current') }}
group by source, source_work_id, source_review_id
having count(*) > 1
