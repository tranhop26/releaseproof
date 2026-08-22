# Live evidence

| Actor | Action | Contract method | Transaction | State | Authoritative readback |
|---|---|---|---|---|---|
| Researcher | Submit pinned evidence | `submit_case` | _fill after live test_ | `SUBMITTED` | `get_case(case_id)` |
| Resolver | Ask validators to decide | `resolve_case` | _fill after live test_ | `VERIFIED`, `REJECTED`, or `UNRESOLVED` | `get_case(case_id)` |
| Researcher | Repeat the same binding | `submit_case` | _fill after live test_ | execution error; prior state unchanged | `get_case(case_id)` |
