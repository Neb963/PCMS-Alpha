// Inline, keyboard-accessible exact-intent confirmation. Never invokes providers.
// A cancelled, missing or mistyped confirmation produces no authorization token.
const active = new WeakMap();
export function requestTypedConfirmation(trigger, expected, description) {
  if (active.has(trigger)) return active.get(trigger);
  if (!trigger?.isConnected || typeof expected !== 'string' || !expected)
    return Promise.resolve(null);
  const pending = new Promise(resolve => {
    const wasDisabled = trigger.disabled;
    trigger.disabled = true;
    const form = document.createElement('form');
    form.className = 'pcms-typed-intent';
    form.setAttribute('aria-label', 'Confirm exact operator intent');
    const explainer = document.createElement('p');
    explainer.textContent = description;
    const label = document.createElement('label');
    label.textContent = 'Type exactly: ' + expected;
    const input = document.createElement('input');
    input.type = 'text';
    input.required = true;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'off');
    label.append(input);
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const confirm = document.createElement('button');
    confirm.type = 'submit';
    confirm.textContent = 'Confirm one step';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    function finish(value) {
      form.remove();
      trigger.disabled = wasDisabled;
      if (trigger.isConnected) trigger.focus();
      resolve(value);
    }
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (input.value !== expected) {
        status.textContent = 'Exact confirmation does not match. No action authorized.';
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      finish(expected);
    });
    cancel.addEventListener('click', () => finish(null));
    form.append(explainer, label, confirm, cancel, status);
    trigger.insertAdjacentElement('afterend', form);
    input.focus();
  });
  const result = pending.finally(() => active.delete(trigger));
  active.set(trigger, result);
  return result;
}
