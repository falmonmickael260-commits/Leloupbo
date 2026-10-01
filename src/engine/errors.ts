/** Erreur métier renvoyée au client (jamais d'information secrète dans le message). */
export class GameError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GameError';
  }
}

export function fail(code: string, message: string): never {
  throw new GameError(code, message);
}
