import type { CleaningRequest, PortalDashboard, PortalProfile } from './portal-contract';

/** These status counts describe the loaded window, never a hidden server total. */
export function cabinetSummary(requests: readonly CleaningRequest[]) {
  const active = requests.filter(item => !['completed', 'cancelled'].includes(item.status));
  const agenda = active.filter(item => ['scheduled', 'in_progress'].includes(item.status) && Number.isFinite(Date.parse(item.scheduledAt || '')))
    .sort((a, b) => Date.parse(a.scheduledAt!) - Date.parse(b.scheduledAt!) || a.id.localeCompare(b.id));
  return {
    active: active.length,
    completed: requests.filter(item => item.status === 'completed').length,
    agenda: agenda.slice(0, 5),
  };
}

export function filterCabinetProfiles(profiles: readonly PortalProfile[], search: string, status: string) {
  const term = search.trim().toLocaleLowerCase();
  return profiles.filter(item => (status === 'all' || item.status === status)
    && (!term || [item.name, item.email, item.id].some(value => value.toLocaleLowerCase().includes(term))));
}

const unique = <T extends {id: string}>(values: T[]) => [...new Map(values.map(item => [item.id, item])).values()];
export type CabinetCollection = 'requests' | 'profiles';
export type CabinetDashboard = PortalDashboard & {page: NonNullable<PortalDashboard['page']>};

function completePage(data: PortalDashboard): CabinetDashboard {
  return {...data, page:data.page ?? {nextRequestCursor:null,nextProfileCursor:null}};
}

/** A cursor advances one collection. The other collection in that response is its first page. */
export function appendDashboardPage(previous: PortalDashboard, incoming: PortalDashboard, collection: CabinetCollection): CabinetDashboard {
  const current=completePage(previous),page=completePage(incoming);
  if (current.session.user?.id !== page.session.user?.id || current.session.role !== page.session.role)
    throw Error('Cabinet identity changed');
  return {
    ...current,
    requests: collection === 'requests' ? unique([...current.requests, ...page.requests]) : current.requests,
    profiles: collection === 'profiles' ? unique([...current.profiles, ...page.profiles]) : current.profiles,
    totals: page.totals,
    page: {
      nextRequestCursor: collection === 'requests' ? page.page.nextRequestCursor : current.page.nextRequestCursor,
      nextProfileCursor: collection === 'profiles' ? page.page.nextProfileCursor : current.page.nextProfileCursor,
    },
    limited: Boolean(collection === 'requests'
      ? page.page.nextRequestCursor || current.page.nextProfileCursor
      : current.page.nextRequestCursor || page.page.nextProfileCursor),
  };
}

/** Refresh all previously loaded pages so reassignment cannot leave stale cards visible. */
export async function loadDashboardWindow(
  read: (query: string) => Promise<PortalDashboard>, requestPages = 1, profilePages = 1,
): Promise<CabinetDashboard> {
  let data = completePage(await read(''));
  for (const collection of ['requests', 'profiles'] as const) {
    const pages = collection === 'requests' ? requestPages : profilePages;
    const seen = new Set<string>();
    for (let index = 1; index < pages; index++) {
      const cursor = collection === 'requests' ? data.page.nextRequestCursor : data.page.nextProfileCursor;
      if (!cursor) break;
      if (seen.has(cursor)) throw Error('Repeated cabinet cursor');
      seen.add(cursor);
      const key = collection === 'requests' ? 'requestCursor' : 'profileCursor';
      data = appendDashboardPage(data, await read('?' + new URLSearchParams({[key]: cursor})), collection);
    }
  }
  return data;
}
