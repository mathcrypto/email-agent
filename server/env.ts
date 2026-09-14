export function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. See .env.example.`);
  return value;
}

export function getPort() {
  return Number(process.env.PORT ?? 3000);
}

export function getAppBaseUrl() {
  return process.env.APP_BASE_URL ?? `http://localhost:${getPort()}`;
}

export function getOpenAIModel() {
  return process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
}

export function requireOpenAIApiKey() {
  return requireEnv("OPENAI_API_KEY");
}

export function requireLocalApiSecret() {
  return requireEnv("LOCAL_API_SECRET");
}

export const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export function getGoogleOAuthConfig() {
  return {
    clientId: requireEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ??
      `${getAppBaseUrl()}/auth/callback/google`,
  };
}
