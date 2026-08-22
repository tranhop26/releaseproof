import { createHash } from "node:crypto";


export interface VerificationClient {
  getContractCode(address: `0x${string}`): Promise<string>;
  getContractSchema(address: `0x${string}`): Promise<unknown>;
  getContractSchemaForCode(code: string): Promise<unknown>;
  readContract(args: any): Promise<any>;
}

export async function verifyDeployment(
  client: VerificationClient,
  address: `0x${string}`,
  expectedSource: string,
) {
  const [deployedSource, deployedSchema, expectedSchema, caseCount] = await Promise.all([
    client.getContractCode(address),
    client.getContractSchema(address),
    client.getContractSchemaForCode(expectedSource),
    client.readContract({ address, functionName: "get_case_count", args: [] }),
  ]);
  const canonicalSource = (source: string) => source.replaceAll("\r\n", "\n");
  if (canonicalSource(deployedSource) !== canonicalSource(expectedSource)) {
    throw new Error("Deployed source does not match local source");
  }
  if (JSON.stringify(deployedSchema) !== JSON.stringify(expectedSchema)) {
    throw new Error("Deployed schema does not match local schema");
  }
  if (Number(caseCount) !== 0) throw new Error("Initial contract readback is not empty");
  return {
    caseCount: 0,
    sourceSha256: createHash("sha256").update(deployedSource).digest("hex"),
  } as const;
}
