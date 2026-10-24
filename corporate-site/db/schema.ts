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

/** A visitor owns only conversations for which they hold a high-entropy secret. */
export const assistantConversations = sqliteTable("assistant_conversations", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  locale: text("locale").notNull(),
  status: text("status").notNull().default("assistant"),
  contactName: text("contact_name").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  privacyVersion: text("privacy_version").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, t => [index("assistant_conversations_updated").on(t.updatedAt)]);
export const assistantMessages = sqliteTable("assistant_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => assistantConversations.id),
  sender: text("sender").notNull(),
  kind: text("kind").notNull().default("text"),
  content: text("content").notNull(),
  requestKey: text("request_key").notNull(),
  createdAt: text("created_at").notNull(),
}, t => [uniqueIndex("assistant_message_retry").on(t.conversationId,t.requestKey),index("assistant_messages_thread").on(t.conversationId,t.createdAt)]);
export const assistantOffers = sqliteTable("assistant_offers", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => assistantConversations.id),
  content: text("content").notNull(),
  state: text("state").notNull().default("pending"),
  requestKey: text("request_key").notNull(),
  createdAt: text("created_at").notNull(),
  decidedAt: text("decided_at"),
}, t => [uniqueIndex("assistant_offer_retry").on(t.conversationId,t.requestKey),index("assistant_offers_thread").on(t.conversationId,t.createdAt)]);
