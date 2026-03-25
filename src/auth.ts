import { requestUrl } from "obsidian";
import * as http from "http";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const SCOPES = "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AuthResult {
  tokens: AuthTokens;
  email: string;
}

export async function startAuthFlow(
  clientId: string,
  clientSecret: string
): Promise<AuthResult> {
  const { code, redirectUri } = await listenForAuthCode(clientId);
  const tokens = await exchangeCodeForTokens(
    code,
    clientId,
    clientSecret,
    redirectUri
  );
  const email = await fetchUserEmail(tokens.accessToken);
  return { tokens, email };
}

function listenForAuthCode(
  clientId: string
): Promise<{ code: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
      const url = new URL(req.url ?? "", `http://127.0.0.1`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h2>Authorization failed.</h2><p>You can close this tab.</p></body></html>"
        );
        server.close();
        reject(new Error(`Auth error: ${error}`));
        return;
      }

      if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h2>Authorization successful!</h2><p>You can close this tab and return to Obsidian.</p></body></html>"
        );
        const addr = server.address();
        const port =
          typeof addr === "object" && addr !== null ? addr.port : 0;
        server.close();
        resolve({ code, redirectUri: `http://127.0.0.1:${port}` });
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port =
        typeof addr === "object" && addr !== null ? addr.port : 0;
      const redirectUri = `http://127.0.0.1:${port}`;
      const authUrl = new URL(GOOGLE_AUTH_URL);
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", SCOPES);
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      window.open(authUrl.toString());
    });

    setTimeout(() => {
      server.close();
      reject(new Error("Auth timed out after 120 seconds"));
    }, 120_000);
  });
}

async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<AuthTokens> {
  const response = await requestUrl({
    url: GOOGLE_TOKEN_URL,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  const data = response.json;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string; expiresAt: number }> {
  const response = await requestUrl({
    url: GOOGLE_TOKEN_URL,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }).toString(),
  });
  const data = response.json;
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function fetchUserEmail(accessToken: string): Promise<string> {
  const response = await requestUrl({
    url: GOOGLE_USERINFO_URL,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.json.email;
}

export async function getValidAccessToken(
  accessToken: string | null,
  refreshToken: string | null,
  tokenExpiry: number | null,
  clientId: string,
  clientSecret: string,
  onRefresh: (accessToken: string, expiresAt: number) => void
): Promise<string> {
  if (!accessToken || !refreshToken) {
    throw new Error("Not authenticated. Please connect to Google Drive.");
  }
  if (tokenExpiry && Date.now() < tokenExpiry - 60_000) {
    return accessToken;
  }
  const refreshed = await refreshAccessToken(
    refreshToken,
    clientId,
    clientSecret
  );
  onRefresh(refreshed.accessToken, refreshed.expiresAt);
  return refreshed.accessToken;
}
