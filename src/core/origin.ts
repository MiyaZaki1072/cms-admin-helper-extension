/** Where the admin's AWS lives, in the forms the browser APIs need. */
export interface AwsLocation {
  /** Base URL with a trailing slash, e.g. "http://10.0.0.5:8889/" or "https://host/aws/". */
  base: string;
  /** Pattern for permissions.request (paths are ignored there), e.g. "http://10.0.0.5:8889/*". */
  permissionPattern: string;
  /** Pattern for the content script, limited to the AWS path, e.g. "https://host/aws/*". */
  matchPattern: string;
}

/**
 * Turn what the admin typed ("localhost:8889", "http://host/aws/login") into an
 * AwsLocation. A trailing "login" or page path is not stripped: the admin
 * should enter the AWS root. Throws with a readable message on bad input.
 */
export function parseAwsUrl(input: string): AwsLocation {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Enter the AWS address, e.g. http://localhost:8889');
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(`"${trimmed}" is not a valid address.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('The AWS address must start with http:// or https://');
  }
  if (url.username || url.password) {
    throw new Error('Do not put a username or password in the address.');
  }
  const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  const host = url.host; // includes the port when it is not the default
  return {
    base: `${url.protocol}//${host}${path}`,
    permissionPattern: `${url.protocol}//${host}/*`,
    matchPattern: `${url.protocol}//${host}${path}*`,
  };
}

/** True for addresses that are only reachable on a LAN or this machine. */
export function isPrivateHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname === '[::1]') return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(hostname);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}
