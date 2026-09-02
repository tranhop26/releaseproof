# Frozen contract recovery

ReleaseProof is `INTENTIONALLY_FROZEN`. It has no owner, upgrade, delete, or
result-edit method. A defect is recovered by deploying a new contract, never by
mutating the predecessor.

1. Preserve the current v1 predecessor and its historical readback unchanged.
   The immutable copy is `deployments/studionet-v1.json`.
2. Fix and fully test a successor contract under a new source hash.
3. Before deployment, verify that `deployments/studionet.json` is the expected
   v1 predecessor (`0x946BC9B19BD971CBefb56845b5825FB7B9f6b183`).
4. Deploy the successor and verify its finalized source, schema, and initial
   `get_case_count` readback.
5. Only after verification, set `studionet-v1.json.successor` to the verified
   successor and replace the current `studionet.json` with the v2 manifest.
6. Cut the frontend configuration to the successor address and keep an explicit
   link to the predecessor record.

No deployment or production cutover is implied by the tooling in this change.
The older v0 predecessor remains separately preserved in
`deployments/studionet-predecessor.json`.
