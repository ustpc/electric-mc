// Login page help. Password managers (1Password, Chrome) look for standard
// autocomplete hints and a form around the fields; Manuscript Central's
// login page doesn't give them reliably. We add the hints, and optionally
// press "Log In" once a password manager has filled both fields.

export interface LoginFields {
  user: HTMLInputElement;
  password: HTMLInputElement;
  submit: HTMLElement | null;
}

export function findLoginFields(doc: Document): LoginFields | null {
  const password = doc.querySelector<HTMLInputElement>('input[type=password]');
  if (!password) return null;
  const scope = password.form ?? password.closest('table,form,div[class*=login i],section,main') ?? doc.body;
  const user =
    scope.querySelector<HTMLInputElement>('input[autocomplete=username]') ??
    Array.from(scope.querySelectorAll<HTMLInputElement>('input[type=text],input[type=email],input:not([type])')).find(
      (i) => i.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING,
    ) ??
    null;
  if (!user) return null;
  const buttons = Array.from(scope.querySelectorAll<HTMLElement>('button,input[type=submit],input[type=button],a'));
  const submit =
    buttons.find((b) => /^\s*log ?in\s*$/i.test((b as HTMLInputElement).value || b.textContent || '') && b.tagName !== 'A') ??
    buttons.find((b) => /^\s*log ?in\s*$/i.test(b.textContent || '') && !b.closest('nav,ul,.nav,.tabs')) ??
    null;
  return { user, password, submit };
}

/** Add the hints password managers look for. Safe to call repeatedly. */
export function annotateLogin(f: LoginFields): void {
  // A form marked autocomplete=off tells some password managers to stay away.
  const form = f.password.form;
  if (form?.getAttribute('autocomplete') === 'off') form.setAttribute('autocomplete', 'on');
  f.user.setAttribute('autocomplete', 'username');
  f.password.setAttribute('autocomplete', 'current-password');
  if (!f.user.name) f.user.name = 'username';
  if (!f.user.id) f.user.id = 'emc-username';
  if (!f.password.id) f.password.id = 'emc-password';
  if (f.submit && f.submit.tagName === 'BUTTON' && !f.submit.getAttribute('type')) f.submit.setAttribute('type', 'submit');
}

const ATTEMPT_KEY = 'emc-auto-login-at';

/**
 * Press "Log In" when both fields get filled without typing (a password
 * manager fills them with input events but no key presses). Only once a
 * minute, so a wrong saved password can't cause a loop.
 */
export function watchForAutofill(f: LoginFields, onSubmit: (how: string) => void): () => void {
  let lastKey = 0;
  let timer: number | undefined;
  const view = f.password.ownerDocument.defaultView!;
  const onKey = () => (lastKey = Date.now());
  const check = () => {
    view.clearTimeout(timer);
    timer = view.setTimeout(() => {
      if (!f.user.value || !f.password.value) return;
      if (Date.now() - lastKey < 1500) return; // the person is typing
      let prev = 0;
      try {
        prev = Number(view.sessionStorage.getItem(ATTEMPT_KEY) ?? 0);
        if (Date.now() - prev < 60_000) return;
        view.sessionStorage.setItem(ATTEMPT_KEY, String(Date.now()));
      } catch {
        /* storage blocked: still submit once */
      }
      // Clicking the page's own button runs whatever script MC attaches to it.
      if (f.submit) {
        f.submit.click();
        onSubmit('button');
      } else if (f.password.form && f.password.ownerDocument.querySelectorAll('input[type=password]').length === 1) {
        // No "Log In" button: submit the form, but never a sign-up form with a confirm field.
        f.password.form.requestSubmit();
        onSubmit('form');
      }
    }, 400);
  };
  for (const el of [f.user, f.password]) {
    el.addEventListener('keydown', onKey);
    el.addEventListener('input', check);
    el.addEventListener('change', check);
  }
  check(); // already filled before we loaded
  return () => {
    view.clearTimeout(timer);
    for (const el of [f.user, f.password]) {
      el.removeEventListener('keydown', onKey);
      el.removeEventListener('input', check);
      el.removeEventListener('change', check);
    }
  };
}
