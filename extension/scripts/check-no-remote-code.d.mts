// Types for scripts/check-no-remote-code.mjs, used by its tests.
export function scanText(text: string): string[];
export function checkCsp(csp: string | undefined, where?: string): string[];
export function checkManifest(manifest: { content_security_policy?: string | Record<string, string> }): string[];
export function checkDir(dir: string): Promise<{ files: number; problems: string[] }>;
