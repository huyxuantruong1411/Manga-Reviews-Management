select 'manga_tag_dup' as issue, manga_id, tag_id as key2
from {{ ref('slv_manga_tag_bridge') }}
group by manga_id, tag_id
having count(*) > 1

union all

select 'manga_creator_dup' as issue, manga_id, creator_id || ':' || role as key2
from {{ ref('slv_manga_creator_bridge') }}
group by manga_id, creator_id, role
having count(*) > 1

union all

select 'tierlist_item_dup' as issue, tierlist_id as manga_id, manga_id as key2
from {{ ref('slv_tierlist_item_current') }}
group by tierlist_id, manga_id
having count(*) > 1
