import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
  CreateSecretCommand
} from "@aws-sdk/client-secrets-manager";

function getClient(region: string): SecretsManagerClient {
  return new SecretsManagerClient({ region });
}

export async function getSecretJson(
  secretId: string,
  region: string
): Promise<Record<string, string>> {
  const client = getClient(region);
  const result = await client.send(
    new GetSecretValueCommand({ SecretId: secretId })
  );

  if (!result.SecretString) {
    return {};
  }

  try {
    return JSON.parse(result.SecretString) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function upsertSecretJson(
  secretId: string,
  region: string,
  values: Record<string, string>
): Promise<void> {
  const client = getClient(region);

  try {
    const current = await getSecretJson(secretId, region);
    const next = { ...current, ...values };
    await client.send(
      new PutSecretValueCommand({
        SecretId: secretId,
        SecretString: JSON.stringify(next)
      })
    );
  } catch (error: any) {
    if (error?.name === "ResourceNotFoundException") {
      await client.send(
        new CreateSecretCommand({
          Name: secretId,
          SecretString: JSON.stringify(values)
        })
      );
      return;
    }
    throw error;
  }
}
