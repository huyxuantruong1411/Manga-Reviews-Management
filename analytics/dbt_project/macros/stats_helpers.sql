{% macro wilson_lower(k_expr, n_expr, z=1.96) -%}
case
    when {{ n_expr }} is null or {{ n_expr }} <= 0 then null
    else (
        (({{ k_expr }}::double / {{ n_expr }}::double) + ({{ z }} * {{ z }}) / (2.0 * {{ n_expr }}::double))
        - {{ z }} * sqrt(
            (({{ k_expr }}::double / {{ n_expr }}::double) * (1.0 - ({{ k_expr }}::double / {{ n_expr }}::double))
             + ({{ z }} * {{ z }}) / (4.0 * {{ n_expr }}::double)) / {{ n_expr }}::double
        )
    ) / (1.0 + ({{ z }} * {{ z }}) / {{ n_expr }}::double)
end
{%- endmacro %}

{% macro wilson_upper(k_expr, n_expr, z=1.96) -%}
case
    when {{ n_expr }} is null or {{ n_expr }} <= 0 then null
    else (
        (({{ k_expr }}::double / {{ n_expr }}::double) + ({{ z }} * {{ z }}) / (2.0 * {{ n_expr }}::double))
        + {{ z }} * sqrt(
            (({{ k_expr }}::double / {{ n_expr }}::double) * (1.0 - ({{ k_expr }}::double / {{ n_expr }}::double))
             + ({{ z }} * {{ z }}) / (4.0 * {{ n_expr }}::double)) / {{ n_expr }}::double
        )
    ) / (1.0 + ({{ z }} * {{ z }}) / {{ n_expr }}::double)
end
{%- endmacro %}

{% macro reliability_from_n(n_expr, low_min=3, med_min=10, high_min=25) -%}
case
    when {{ n_expr }} is null or {{ n_expr }} < {{ low_min }} then 'insufficient_data'
    when {{ n_expr }} < {{ med_min }} then 'low'
    when {{ n_expr }} < {{ high_min }} then 'medium'
    else 'high'
end
{%- endmacro %}
