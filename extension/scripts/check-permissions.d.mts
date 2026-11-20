export function asks(manifest: object): Record<string, string[]>;
export function extra(manifest: object, allowed: Record<string, string[]>): string[];
export function flavor(manifest: { name?: string }): 'store' | 'test';
