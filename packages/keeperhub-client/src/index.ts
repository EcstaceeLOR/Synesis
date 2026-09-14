export const KEEPERHUB_API_ORIGIN = "https://app.keeperhub.com";

export interface KeeperHubClientOptions {
  readonly apiKey: string;
  readonly apiOrigin?: string;
}
