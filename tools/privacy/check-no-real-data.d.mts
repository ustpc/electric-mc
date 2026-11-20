export const ID: RegExp;
export const EMAIL: RegExp;
export function syntheticNumber(n: string | number): boolean;
export interface Secrets { names: Set<string>; emails: Set<string>; ids: Set<string> }
export function localSecrets(varDir?: string): Secrets;
export function scanText(text: string, allow?: Set<string>, secrets?: Secrets | null): Array<{ line: number; kind: string }>;
