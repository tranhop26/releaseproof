# Frozen contract recovery

ReleaseProof is `INTENTIONALLY_FROZEN`. It has no owner, upgrade, delete, or
result-edit method. A defect is recovered by deploying a new contract, never by
mutating the predecessor.

1. Preserve the predecessor and its historical readback unchanged.
2. Fix and fully test a successor contract under a new source hash.
3. Deploy the successor and verify its deployed source, schema, and initial
   readback against the deployment manifest.
4. Link predecessor and successor addresses in both manifests.
5. Cut the frontend configuration to the successor address and keep an explicit
   link to predecessor records.
