import {
  pgTable,
  text,
  timestamp,
  date,
  integer,
  jsonb,
  uuid,
} from 'drizzle-orm/pg-core';

// One anonymous visitor session. Identified by an HTTP-only signed cookie.
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  language: text('language').default('en').notNull(),
  // onboarding | planning | active | completed
  status: text('status').default('onboarding').notNull(),
  // Which Normie identity the visitor chose to talk to (token ID as text).
  // Defaults to Gemel (#6832); remembered across visits via the session cookie.
  agentTokenId: text('agent_token_id').default('6832').notNull(),
});

// Trip preferences gathered during the onboarding conversation.
export const tripProfiles = pgTable('trip_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  arrivalDate: date('arrival_date'),
  departureDate: date('departure_date'),
  // solo | couple | friends | family
  groupType: text('group_type'),
  // budget | midrange | premium
  budgetLevel: text('budget_level'),
  // art | food | nightlife | architecture | nature | shopping | music | ...
  interests: text('interests').array(),
  dietaryNeeds: text('dietary_needs'),
  mobilityNeeds: text('mobility_needs'),
  // ISO date strings for the NFC days the visitor will attend
  nfcDays: text('nfc_days').array(),
  // relaxed | balanced | packed
  pace: text('pace'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Full chat history per session. Last N rows are loaded into Claude context.
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  // user | assistant
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Versioned itineraries. shareToken powers the public /itinerary/[token] view.
export const itineraries = pgTable('itineraries', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  version: integer('version').default(1).notNull(),
  content: jsonb('content').notNull(),
  shareToken: text('share_token').unique().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Individual recommendations surfaced in conversation, indexed for quick lookup.
export const recommendations = pgTable('recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  itineraryId: uuid('itinerary_id').references(() => itineraries.id, {
    onDelete: 'set null',
  }),
  // restaurant | gallery | bar | landmark | event
  type: text('type').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  address: text('address'),
  neighbourhood: text('neighbourhood'),
  date: date('date'),
  // morning | afternoon | evening
  timeSlot: text('time_slot'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
