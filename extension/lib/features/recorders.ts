// What the content script learns about the person and tells the
// background: their MC roles (lib/roles.ts) and who is logged in
// (lib/identity.ts). Each is sent only when new.

import { readIdentity } from '../identity';
import { roleLabels, rolesIn } from '../roles';
import type { Feature } from './feature';

export function recordRoles(): Feature {
  const sent = new Set<string>();
  return {
    id: 'roles',
    onPage({ doc, result, send }) {
      const found = rolesIn(roleLabels(doc, result.breadcrumb)).filter((x) => !sent.has(x));
      if (!found.length || !result.site) return;
      found.forEach((x) => sent.add(x));
      send({ type: 'roles', site: result.site, roles: found });
    },
  };
}

export function recordIdentity(): Feature {
  let sent = '';
  return {
    id: 'identity',
    onPage({ doc, result, send }) {
      const id = result.site ? readIdentity(doc) : null;
      if (!id || !result.site) return;
      const key = JSON.stringify(id);
      if (key === sent) return;
      sent = key;
      send({ type: 'identity', site: result.site, identity: id });
    },
  };
}
