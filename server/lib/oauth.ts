import { google } from "googleapis";
import { getGoogleOAuthConfig } from "../env.js";

export function createOAuthClient() {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}
