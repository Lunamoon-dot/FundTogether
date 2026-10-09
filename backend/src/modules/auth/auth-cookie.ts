import { ConfigService } from "@nestjs/config";

export function sessionCookieName(config: ConfigService) {
  return config.get<string>("authSessionCookieName") ?? "ft_session";
}

export function readSessionCookie(header: string | undefined, name: string): string | undefined {
  const matches = header?.split(";").map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  if (matches?.length !== 1) return undefined;
  return matches[0].slice(name.length + 1) || undefined;
}
