/**
 * Serveurs ICE transmis aux navigateurs pour la voix (WebRTC).
 *
 * - STUN (gratuit) : suffit pour la plupart des connexions.
 * - TURN (relais) : indispensable pour les joueurs derrière un réseau qui bloque
 *   les liaisons directes (certaines box, 4G, réseaux d'entreprise). À configurer
 *   via les variables d'environnement, jamais en dur dans le code :
 *     TURN_URLS="turn:relay.exemple.com:3478,turns:relay.exemple.com:443"
 *     TURN_USERNAME=...   TURN_CREDENTIAL=...
 *   ou ICE_SERVERS='[{"urls":"stun:..."},{"urls":"turn:...","username":"...","credential":"..."}]'
 */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const DEFAULT_STUN: IceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

export function iceServersFromEnv(env: NodeJS.ProcessEnv = process.env): IceServer[] {
  if (env.ICE_SERVERS) {
    try {
      const parsed = JSON.parse(env.ICE_SERVERS);
      if (Array.isArray(parsed) && parsed.every((s) => s && (typeof s.urls === 'string' || Array.isArray(s.urls)))) return parsed;
      console.warn('[ice] ICE_SERVERS invalide, valeurs par défaut utilisées');
    } catch {
      console.warn('[ice] ICE_SERVERS n’est pas du JSON valide, valeurs par défaut utilisées');
    }
  }
  const servers = [...DEFAULT_STUN];
  if (env.TURN_URLS) {
    servers.push({
      urls: env.TURN_URLS.split(',').map((u) => u.trim()).filter(Boolean),
      username: env.TURN_USERNAME,
      credential: env.TURN_CREDENTIAL,
    });
  }
  return servers;
}
