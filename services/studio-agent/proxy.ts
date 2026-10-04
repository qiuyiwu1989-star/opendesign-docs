/** Only an explicitly selected loopback service can receive local document traffic. */
export function studioAgentProxyTarget(value: string | undefined): string | undefined {
  if (!value) return;
  const url = new URL(value);
  if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname)||!url.port||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('STUDIO_AGENT_URL must be an HTTP loopback origin with an explicit port');
  return url.origin;
}
