/** Transport réservé au serveur ; une erreur reste réessayable par la file persistée. */
export function platformConfigured(): boolean {
  return Boolean(process.env.PLATFORM_SUPABASE_URL && process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY);
}

export async function platformRpc(name: string, body: object): Promise<unknown> {
  const url = process.env.PLATFORM_SUPABASE_URL;
  const key = process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Plateforme non configurée.');
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new Error(data?.message || `Plateforme indisponible (${response.status}).`);
  return data;
}
