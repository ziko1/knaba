import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { portalHeader } from '../lib/portal-contract';
import { portalMessages, type PortalLocale } from '../lib/portal-i18n';
import { workspaceWords } from '../lib/workspace-i18n';
import { safeWorkspaceRedirect } from '../lib/workspace-navigation';
import '../styles/workspace.css';

interface Workspace { enabled: true; isolated: true; role: string; roles: string[] }

export default function DeveloperWorkspaceBar(props: { locale: PortalLocale; onEnabled?: (enabled: boolean) => void }) {
  const [workspace, setWorkspace] = createSignal<Workspace | null>(null);
  const [role, setRole] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  const t = () => workspaceWords[props.locale];
  const controller = new AbortController();
  let disposed = false;
  let switchController: AbortController | undefined;
  onMount(async () => {
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch('/api/developer/workspace', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      if (response.status === 404) return;
      if (!response.ok) throw Error('unavailable');
      const data = await response.json() as Workspace;
      if (disposed) return;
      if (data.enabled !== true || data.isolated !== true || !Array.isArray(data.roles) || !data.roles.includes(data.role)) throw Error('invalid workspace');
      setWorkspace(data); setRole(data.role); props.onEnabled?.(true);
    } catch { if (!disposed) setError(t().testFailed); }
    finally { clearTimeout(timer); }
  });
  onCleanup(() => { disposed = true; controller.abort(); switchController?.abort(); });
  async function switchRole(event: SubmitEvent) {
    event.preventDefault();
    if (busy() || role() === workspace()?.role || !window.confirm(t().testConfirm)) return;
    setBusy(true); setError('');
    const requestController = new AbortController(); switchController = requestController;
    const timer = setTimeout(() => requestController.abort(), 15_000);
    try {
      const response = await fetch('/api/developer/workspace?lang=' + props.locale, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { ...portalHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: role() }), signal: requestController.signal,
      });
      if (!response.ok) throw Error('switch failed');
      const data = await response.json();
      if (disposed) return;
      const redirect = data.isolated === true ? safeWorkspaceRedirect(data.redirect) : null;
      if (!redirect) throw Error('invalid destination');
      window.location.assign(redirect);
    } catch { if (!disposed) { setError(t().testFailed); setBusy(false); } }
    finally { clearTimeout(timer); if (switchController === requestController) switchController = undefined; }
  }
  return <>
    <Show when={workspace()}><section class="workspace-test" aria-label={t().testTitle}>
      <div><strong>{t().testTitle}</strong><p>{t().testInfo}</p></div>
      <form onSubmit={switchRole}><label>{t().testRole}<select value={role()} onChange={e => setRole(e.currentTarget.value)} disabled={busy()}>
        <For each={workspace()?.roles}>{value => <option value={value}>{portalMessages[props.locale][value as keyof typeof portalMessages.de] || value}</option>}</For>
      </select></label><button type="submit" disabled={busy() || role() === workspace()?.role}>{busy() ? portalMessages[props.locale].loading : t().testChange}</button></form>
    </section></Show>
    <Show when={error()}><p class="portal-alert portal-alert-error" role="alert">{error()}</p></Show>
  </>;
}
