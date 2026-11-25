import { assert, id } from '../../packages/domain/core.ts';

export interface PartnerOrder {
  id: string;
  status: string;
  updatedAt: string;
}

interface OrderReader {
  companyId: string;
  query(sql: string, params: unknown[]): Promise<{ rows: Array<Record<string, any>> }>;
}

const orderStatuses = new Set([
  'PENDING_OPERATIONS', 'CONFIRMED', 'SCHEDULED', 'IN_PROGRESS', 'WORK_SUBMITTED',
  'CLIENT_REVIEW', 'CLOSED', 'PAUSED', 'CANCELLED', 'DISPUTED',
]);

// The caller resolves customerId from the current, owner-approved grant inside
// this same tenant transaction. JSON equality keeps, e.g., numeric 42 distinct
// from the string identifier "42". Contradictory legacy aliases fail closed.
const scopedOrders = `
  SELECT id, data->>'status' AS status, updated_at
  FROM aggregates
  WHERE company_id = $1 AND kind = 'order'
    AND data->'customerId' = $2
    AND (data->'customer_id' IS NULL OR data->'customer_id' = data->'customerId')`;

function validId(value: unknown): value is string {
  return id.safeParse(value).success && typeof value === 'string' && !value.includes('\u0000') && Buffer.from(value).toString() === value;
}

function project(row: Record<string, any>): PartnerOrder {
  return {
    id: row.id,
    status: orderStatuses.has(row.status) ? row.status : 'UNKNOWN',
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function listPartnerOrders(
  tx: OrderReader, customerId: string, page: { after?: string; limit?: number } = {},
): Promise<{ items: PartnerOrder[]; nextAfter: string | null }> {
  assert(validId(customerId), 'ACCESS_DENIED');
  const { after, limit = 50 } = page;
  assert((after === undefined || validId(after)) && Number.isInteger(limit) && limit >= 1 && limit <= 100, 'VALIDATION_ERROR');
  const { rows } = await tx.query(
    scopedOrders + ' AND id > $3 ORDER BY id LIMIT $4',
    [tx.companyId, JSON.stringify(customerId), after ?? '', limit + 1],
  );
  const items = rows.slice(0, limit).map(project);
  return { items, nextAfter: rows.length > limit ? items[items.length - 1].id : null };
}

export async function getPartnerOrder(tx: OrderReader, customerId: string, orderId: string): Promise<PartnerOrder> {
  assert(validId(customerId), 'ACCESS_DENIED');
  assert(validId(orderId), 'VALIDATION_ERROR');
  const { rows } = await tx.query(scopedOrders + ' AND id = $3', [tx.companyId, JSON.stringify(customerId), orderId]);
  assert(rows.length === 1, 'NOT_FOUND_SAFE');
  return project(rows[0]);
}
