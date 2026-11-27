{% macro normalize_read_status(expr) -%}
case
    when {{ expr }} is null or trim({{ expr }}) = '' then null
    when lower(trim({{ expr }})) like 'readstatus.%'
        then lower(split_part(trim({{ expr }}), '.', 2))
    else lower(trim({{ expr }}))
end
{%- endmacro %}

{% macro normalize_pub_status(expr) -%}
case
    when {{ expr }} is null or trim({{ expr }}) = '' then null
    else lower(trim({{ expr }}))
end
{%- endmacro %}
