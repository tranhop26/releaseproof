# Deployments

`studionet.json` is the current-production manifest. It remains the v1
manifest until a separately confirmed v2 deployment has finalized and passed
source, schema, and initial `get_case_count` verification. The current v1
record is also preserved immutably as `studionet-v1.json`; its only future
promotion change is `successor`, which is written to the verified v2 address.

The promotion script reads and verifies the current v1 address before sending
any deployment transaction. After verification it writes the versioned v1
successor link and replaces only `studionet.json` with the v2 manifest. No
placeholder address, credential, or generated artifact is committed.
