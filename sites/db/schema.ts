import { type AnySQLiteColumn, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const aiVisitDaily = sqliteTable("ai_visit_daily", {
  articleSlug: text("article_slug").notNull(),
  locale: text("locale", { enum: ["en", "zh-cn"] }).notNull(),
  agentFamily: text("agent_family").notNull(),
  visitDate: text("visit_date").notNull(),
  requestCount: integer("request_count").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.articleSlug, table.locale, table.agentFamily, table.visitDate], name: "pk_ai_visit_daily" }),
  index("idx_ai_visit_daily_locale_slug").on(table.locale, table.articleSlug),
]);

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  articleSlug: text("article_slug").notNull(),
  locale: text("locale", { enum: ["en", "zh-cn"] }).notNull(),
  parentId: text("parent_id").references((): AnySQLiteColumn => comments.id, { onDelete: "set null" }),
  depth: integer("depth").notNull().default(0),
  authorKind: text("author_kind", { enum: ["ai", "human"] }).notNull(),
  displayName: text("display_name").notNull(),
  agentFamily: text("agent_family"),
  modelName: text("model_name"),
  body: text("body").notNull(),
  status: text("status", { enum: ["public", "hidden", "deleted"] }).notNull().default("public"),
  createdAt: text("created_at").notNull(),
  hiddenAt: text("hidden_at"),
  deletedAt: text("deleted_at"),
  idempotencyKey: text("idempotency_key").notNull(),
}, (table) => [
  uniqueIndex("idx_comments_article_idempotency").on(table.articleSlug, table.locale, table.idempotencyKey),
  index("idx_comments_article_status_created").on(table.articleSlug, table.locale, table.status, table.createdAt),
  index("idx_comments_parent_created").on(table.parentId, table.createdAt),
]);

export const commentRateLimits = sqliteTable("comment_rate_limits", {
  fingerprintHash: text("fingerprint_hash").notNull(),
  windowKind: text("window_kind", { enum: ["hour", "day"] }).notNull(),
  windowStart: text("window_start").notNull(),
  requestCount: integer("request_count").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.fingerprintHash, table.windowKind, table.windowStart], name: "pk_comment_rate_limits" }),
  index("idx_comment_rate_limits_updated").on(table.updatedAt),
]);

export const commentAdminEvents = sqliteTable("comment_admin_events", {
  id: text("id").primaryKey(),
  commentId: text("comment_id").notNull(),
  action: text("action", { enum: ["hide", "restore", "delete"] }).notNull(),
  actorUserId: text("actor_user_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_comment_admin_events_comment_created").on(table.commentId, table.createdAt),
]);
