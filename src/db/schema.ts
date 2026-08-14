import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// --- AUTHENTICATION TABLES (Better Auth) ---

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  role: text("role").default("customer").notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

// --- SAAS: MULTI-TENANT CORE ---

export const storeTable = pgTable("store", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),

  logoUrl: text("logo_url"),
  banner1DesktopUrl: text("banner1_desktop_url"),
  banner1MobileUrl: text("banner1_mobile_url"),
  banner2DesktopUrl: text("banner2_desktop_url"),
  banner2MobileUrl: text("banner2_mobile_url"),
  colorPrimary: text("color_primary").default("#8B5CF6").notNull(),

  instagramUrl: text("instagram_url"),
  whatsapp: text("whatsapp"),

  fixedShippingFeeInCents: integer("fixed_shipping_fee_in_cents")
    .default(0)
    .notNull(),
  freeShippingThresholdInCents: integer("free_shipping_threshold_in_cents"),

  pixDiscountPercent: integer("pix_discount_percent").default(0).notNull(),

  enableOnlinePayments: boolean("enable_online_payments")
    .default(true)
    .notNull(),

  isActive: boolean("is_active").default(true).notNull(),

  stripePublicKey: text("stripe_public_key"),
  stripeSecretKey: text("stripe_secret_key"),
  stripeWebhookSecret: text("stripe_webhook_secret"),
  mpAccessToken: text("mp_access_token"),
  termsAcceptedAt: timestamp("terms_accepted_at"),

  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const storeRelations = relations(storeTable, ({ many, one }) => ({
  owner: one(user, {
    fields: [storeTable.ownerId],
    references: [user.id],
  }),
  categories: many(categoryTable),
  products: many(productTable),
  orders: many(orderTable),
  carts: many(cartTable),
}));

export const userRelations = relations(user, ({ many }) => ({
  stores: many(storeTable),
}));

// --- E-COMMERCE TABLES ---

export const categoryTable = pgTable("category", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => storeTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const categoryRelations = relations(categoryTable, ({ many, one }) => ({
  products: many(productTable),
  store: one(storeTable, {
    fields: [categoryTable.storeId],
    references: [storeTable.id],
  }),
}));

export const productTable = pgTable("product", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description").notNull(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categoryTable.id),
  storeId: uuid("store_id")
    .notNull()
    .references(() => storeTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const productRelations = relations(productTable, ({ one, many }) => ({
  category: one(categoryTable, {
    fields: [productTable.categoryId],
    references: [categoryTable.id],
  }),
  store: one(storeTable, {
    fields: [productTable.storeId],
    references: [storeTable.id],
  }),
  variants: many(productVariantTable),
}));

export const productVariantTable = pgTable("product_variant", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  color: text("color").notNull(),

  // Preço atual de venda (O valor que o cliente efetivamente paga)
  priceInCents: integer("price_in_cents").notNull(),

  // NOVO: Preço Original/De Comparação (Opcional)
  compareAtPriceInCents: integer("compare_at_price_in_cents"),

  imageUrl: text("image_url").notNull(),
  productId: uuid("product_id")
    .notNull()
    .references(() => productTable.id, { onDelete: "cascade" }),
  size: text("size").notNull().default("Única"),
  stock: integer("stock").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const productVariantRelations = relations(
  productVariantTable,
  ({ one }) => ({
    product: one(productTable, {
      fields: [productVariantTable.productId],
      references: [productTable.id],
    }),
  }),
);

export const shippingAddressTable = pgTable("shipping_address", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  fullName: text("full_name").notNull(),
  cpf: text("cpf").notNull(),
  phone: text("phone").notNull(),
  zipCode: text("zip_code").notNull(),
  address: text("address").notNull(),
  number: text("number").notNull(),
  complement: text("complement"),
  neighborhood: text("neighborhood").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const cartTable = pgTable("cart", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  shippingAddressId: uuid("shipping_address_id").references(
    () => shippingAddressTable.id,
  ),
  storeId: uuid("store_id")
    .notNull()
    .references(() => storeTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const cartRelations = relations(cartTable, ({ many, one }) => ({
  items: many(cartItemTable),
  shippingAddress: one(shippingAddressTable, {
    fields: [cartTable.shippingAddressId],
    references: [shippingAddressTable.id],
  }),
  store: one(storeTable, {
    fields: [cartTable.storeId],
    references: [storeTable.id],
  }),
}));

export const cartItemTable = pgTable("cart_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  cartId: uuid("cart_id")
    .notNull()
    .references(() => cartTable.id, { onDelete: "cascade" }),
  productVariantId: uuid("product_variant_id")
    .notNull()
    .references(() => productVariantTable.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const cartItemRelations = relations(cartItemTable, ({ one }) => ({
  cart: one(cartTable, {
    fields: [cartItemTable.cartId],
    references: [cartTable.id],
  }),
  productVariant: one(productVariantTable, {
    fields: [cartItemTable.productVariantId],
    references: [productVariantTable.id],
  }),
}));

export const orderTable = pgTable("order", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  shippingAddressId: uuid("shipping_address_id")
    .notNull()
    .references(() => shippingAddressTable.id),
  storeId: uuid("store_id")
    .notNull()
    .references(() => storeTable.id, { onDelete: "cascade" }),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),

  pixQrCode: text("pix_qr_code"),
  pixQrCodeBase64: text("pix_qr_code_base64"),
  pixPaymentId: text("pix_payment_id"),
  status: text("status").notNull(),
  orderNumber: integer("order_number").notNull().unique(),
  totalPriceInCents: integer("total_price_in_cents").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const orderRelations = relations(orderTable, ({ many, one }) => ({
  items: many(orderItemTable),
  shippingAddress: one(shippingAddressTable, {
    fields: [orderTable.shippingAddressId],
    references: [shippingAddressTable.id],
  }),
  store: one(storeTable, {
    fields: [orderTable.storeId],
    references: [storeTable.id],
  }),
}));

export const orderItemTable = pgTable("order_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orderTable.id, { onDelete: "cascade" }),
  productVariantId: uuid("product_variant_id")
    .notNull()
    .references(() => productVariantTable.id),
  quantity: integer("quantity").notNull(),
  priceInCents: integer("price_in_cents").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const orderItemRelations = relations(orderItemTable, ({ one }) => ({
  order: one(orderTable, {
    fields: [orderItemTable.orderId],
    references: [orderTable.id],
  }),
  productVariant: one(productVariantTable, {
    fields: [orderItemTable.productVariantId],
    references: [productVariantTable.id],
  }),
}));

export const notificationTable = pgTable("notification", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- SAAS: ANNOUNCEMENTS / CHANGELOG ---

export const announcementTable = pgTable("announcement", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  type: text("type").default("info").notNull(), // Ex: 'info', 'update', 'maintenance'
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
