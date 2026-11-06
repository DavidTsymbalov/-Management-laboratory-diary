# Teacher workspace and student administrators

The existing dark palette stays unchanged: ink #080a0d, paper #e5dac3,
selection #1a2330, existing film blue #0a2f9b. Light mode uses white #ffffff,
soft grey #f5f6f7 and dark ink #161a20. Films keep their original colours.
Aktiv Grotesk and Inter remain the type system, with readable sentence-case labels.

The current permanent add form competes with the class list. Replace it with a
searchable full-width list and an on-demand add form. A small navigation column
separates overview, pupils, awards, administrators and activity. On a phone,
navigation wraps above the content; rows become labelled compact records.

    profile     Overview / Pupils / Awards / Administrators / Activity
    navigation  page heading                           primary action
                results / class list / selected task

Four top totals are an overview, not four competing destinations. Supporting
statistics explain distribution and participation; a dated activity record adds
accountability. Do not invent historical point balances from current totals.
Historical activity starts when logging is enabled; award dates already exist.

A teacher promotes an existing pupil, retaining their password and personal diary.
Only teachers can grant, change or revoke this capability. A configurable class capacity (default 26) limits administrators adding pupils; deleting a pupil frees one place. Daily
limits apply to deleted pupils, absolute point changes across all
recipients, and newly awarded achievements. Default 5 / 100 / 10; days reset
at midnight Moscow time. Zero disables that action. Administrators cannot change
their own results, another administrator, or teachers. Quotas and logs are enforced
inside PostgreSQL transactions, never in localStorage or just UI buttons.

Review: retain the homepage and dark colours the user just restored. Avoid another
whole-site rebrand. The meaningful changes are task order, list readability,
real statistics, explicit permissions and a usable light theme.
