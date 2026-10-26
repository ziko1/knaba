import { lazy, Match, Show, Switch } from 'solid-js';
import { canAccessAdminModule, type AdminModuleId } from '../lib/admin-access';
import type { PortalLocale } from '../lib/portal-i18n';

// Adapter boundary: each already-shipped feature keeps its API, state,
// migration history, authentication and independent lazy JS chunk.
const Portal = lazy(() => import('./Portal'));
const CrmConsole = lazy(() => import('./CrmConsole'));
const AssistantInbox = lazy(() => import('./AssistantInbox'));
const SiteStudio = lazy(() => import('./SiteStudio'));

export default function AdminModuleOutlet(props: {
  id: AdminModuleId;
  role: string | null | undefined;
  locale: PortalLocale;
}) {
  // Defense-in-depth for the UI only; all API checks are server-authoritative.
  return <Show when={canAccessAdminModule(props.role, props.id)}>
    <Switch>
      <Match when={props.id === 'operations'}><Portal locale={props.locale} /></Match>
      <Match when={props.id === 'crm'}><CrmConsole /></Match>
      <Match when={props.id === 'messages'}><AssistantInbox locale={props.locale === 'ru' ? 'ru' : 'de'} /></Match>
      <Match when={props.id === 'studio'}><SiteStudio /></Match>
    </Switch>
  </Show>;
}
