import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull(),
  requestedRole: text("requested_role").notNull(), role: text("role"), status: text("status").notNull().default("pending"),
  privacyVersion: text("privacy_version").notNull(), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull().default(1), lastMutation: text("last_mutation").notNull(),
});
export const requests = sqliteTable("cleaning_requests", {
  id: text("id").primaryKey(), clientId: text("client_id").references(() => profiles.id),
  service: text("service").notNull(), objectType: text("object_type").notNull(), postcode: text("postcode").notNull(),
  area: text("area").notNull(), frequency: text("frequency").notNull(), message: text("message").notNull(),
  contactName: text("contact_name").notNull(), email: text("email").notNull(), phone: text("phone").notNull(), address: text("address").notNull(),
  status: text("status").notNull().default("new"), assignedWorkerId: text("assigned_worker_id").references(() => profiles.id),
  scheduledAt: text("scheduled_at"), checklist: text("checklist").notNull().default("[]"), workerNote: text("worker_note").notNull().default(""),
  customerFeedback: text("customer_feedback").notNull().default(""), adminReply: text("admin_reply").notNull().default(""),
  dedupeScope: text("dedupe_scope").notNull(), idempotencyKey: text("idempotency_key").notNull(), payloadHash: text("payload_hash").notNull(),
  privacyVersion: text("privacy_version").notNull(), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull().default(1), lastMutation: text("last_mutation").notNull(),
}, (t) => [uniqueIndex("request_idempotency").on(t.dedupeScope,t.idempotencyKey), index("request_client").on(t.clientId), index("request_worker").on(t.assignedWorkerId)]);
export const audit = sqliteTable("portal_audit", {
  id: text("id").primaryKey(), actorId: text("actor_id").notNull(), action: text("action").notNull(), entityId: text("entity_id").notNull(), createdAt: text("created_at").notNull(),
});
export const rateLimits = sqliteTable("portal_rate_limits", {
  key: text("key").primaryKey(), count: integer("count").notNull(), expiresAt: integer("expires_at").notNull(),
});

export const assistantThreads=sqliteTable('assistant_threads',{
  id:text('id').primaryKey(),
  capabilityHash:text('capability_hash').notNull().unique(),
  openingHash:text('opening_hash').notNull(),
  openingKey:text('opening_key').notNull(),
  locale:text('locale').notNull(),
  status:text('status').notNull().default('open'),
  consentVersion:text('consent_version').notNull(),
  createdAt:text('created_at').notNull(),
  expiresAt:text('expires_at').notNull(),
  lastMessageAt:text('last_message_at').notNull(),
},t=>[index('assistant_threads_recent').on(t.lastMessageAt)]);
export const assistantMessages=sqliteTable('assistant_messages',{
  id:text('id').primaryKey(),
  threadId:text('thread_id').notNull().references(()=>assistantThreads.id,{onDelete:'cascade'}),
  author:text('author').notNull(),
  body:text('body').notNull(),
  idempotencyKey:text('idempotency_key').notNull(),
  payloadHash:text('payload_hash').notNull(),
  createdAt:text('created_at').notNull(),
  lastMutation:text('last_mutation').notNull(),
},t=>[uniqueIndex('assistant_message_dedupe').on(t.threadId,t.author,t.idempotencyKey),index('assistant_message_thread').on(t.threadId)]);

/** Text-only marketing copy. ERP data and legal pages are out of scope. */
export const cmsPages = sqliteTable("cms_pages", {
  path: text("path").primaryKey(),
  draftJson: text("draft_json").notNull().default("{}"),
  publishedJson: text("published_json").notNull().default("{}"),
  version: integer("version").notNull().default(1),
  publishedVersion: integer("published_version").notNull().default(0),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const cmsHistory = sqliteTable("cms_history", {
  id: text("id").primaryKey(),
  path: text("path").notNull().references(() => cmsPages.path),
  version: integer("version").notNull(),
  kind: text("kind").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  actorId: text("actor_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("cms_history_path_version").on(t.path, t.version), index("cms_history_path").on(t.path)]);


/** Operational request state remains in ERP/cleaning_requests; CRM stores only presentation and follow-up. */
export const crmContactState=sqliteTable('crm_contact_state',{
  contactKey:text('contact_key').primaryKey(),
  stage:text('stage').notNull().default('new'),
  tagsJson:text('tags_json').notNull().default('[]'),
  version:integer('version').notNull().default(1),
  updatedBy:text('updated_by').notNull(),
  updatedAt:text('updated_at').notNull(),
  lastMutation:text('last_mutation').notNull(),
});
export const crmContactNotes=sqliteTable('crm_contact_notes',{
  id:text('id').primaryKey(),
  contactKey:text('contact_key').notNull(),
  body:text('body').notNull(),
  actorId:text('actor_id').notNull(),
  idempotencyKey:text('idempotency_key').notNull(),
  createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('crm_note_idempotency').on(t.contactKey,t.actorId,t.idempotencyKey),
      index('crm_note_contact_recent').on(t.contactKey,t.createdAt)]);
