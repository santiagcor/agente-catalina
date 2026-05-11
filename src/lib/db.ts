import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  mode: 'AI' | 'HUMAN';
  lead_temperature: 'frio' | 'tibio' | 'caliente';
  kommo_lead_id: number | null;
  kommo_contact_id: number | null;
  kommo_status_id: string | null;
  catalina_nombre: string | null;
  catalina_ciudad: string | null;
  catalina_tipo_persona: string | null;
  catalina_consumo: string | null;
  catalina_consentimiento: string;
  catalina_cita_estado: string;
  catalina_cita_preferencia: string;
  last_catalina_json: string | null;
  last_message_at: number | null;
  created_at: number;
}

export interface ConversationWithPreview extends Conversation {
  last_message_content: string | null;
  last_message_role: string | null;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant' | 'human';
  content: string;
  ca_message_id: string | null;
  created_at: number;
}

export interface CatalinaConversationData {
  catalina_nombre?: string | null;
  catalina_ciudad?: string | null;
  catalina_tipo_persona?: string | null;
  catalina_consumo?: string | null;
  catalina_consentimiento?: string;
  lead_temperature?: string;
  kommo_status_id?: string | null;
  kommo_lead_id?: number | null;
  kommo_contact_id?: number | null;
  catalina_cita_estado?: string;
  catalina_cita_preferencia?: string;
  last_catalina_json?: string | null;
}

// ── Inicialización ─────────────────────────────────────────────────────────

const dataDir = path.join(process.cwd(), 'data');
// La base de datos se abre de forma lazy la primera vez que se usa.
// Esto evita que el build de Next.js abra la DB durante la fase de análisis estático.

let _db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (_db) return _db;

  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const instance = new DatabaseSync(path.join(dataDir, 'messages.db'));
  instance.exec('PRAGMA journal_mode = WAL');
  instance.exec('PRAGMA foreign_keys = ON');
  instance.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      name TEXT,
      mode TEXT CHECK(mode IN ('AI','HUMAN')) NOT NULL DEFAULT 'AI',
      lead_temperature TEXT CHECK(lead_temperature IN ('frio','tibio','caliente')) DEFAULT 'frio',
      kommo_lead_id INTEGER,
      kommo_contact_id INTEGER,
      kommo_status_id TEXT,
      catalina_nombre TEXT,
      catalina_ciudad TEXT,
      catalina_tipo_persona TEXT,
      catalina_consumo TEXT,
      catalina_consentimiento TEXT DEFAULT 'pendiente',
      catalina_cita_estado TEXT DEFAULT '',
      catalina_cita_preferencia TEXT DEFAULT '',
      last_catalina_json TEXT,
      last_message_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      role TEXT CHECK(role IN ('user','assistant','human')) NOT NULL,
      content TEXT NOT NULL,
      ca_message_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv
      ON messages(conversation_id, created_at);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_ca_id
      ON messages(ca_message_id) WHERE ca_message_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS processed_webhook_messages (
      ca_message_id TEXT PRIMARY KEY,
      processed_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS zapier_actions_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      action TEXT NOT NULL,
      status TEXT CHECK(status IN ('ok','error','pending')) DEFAULT 'pending',
      payload TEXT,
      response TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  _db = instance;
  return _db;
}

// ── Helpers de conversaciones ──────────────────────────────────────────────

export function getOrCreateConversation(phone: string, name?: string | null): Conversation {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO conversations (phone, name) VALUES (?, ?)').run(phone, name ?? null);
  return db.prepare('SELECT * FROM conversations WHERE phone = ?').get(phone) as unknown as Conversation;
}

export function getConversationById(id: number): Conversation | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as unknown as Conversation) ?? null;
}

export function getConversationByLeadId(leadId: number): ConversationWithPreview | null {
  const db = getDb();
  return (db.prepare(`
    SELECT c.*,
      m.content AS last_message_content,
      m.role    AS last_message_role
    FROM conversations c
    LEFT JOIN messages m ON m.id = (
      SELECT id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
    )
    WHERE c.kommo_lead_id = ?
  `).get(leadId) as unknown as ConversationWithPreview) ?? null;
}

export function updateConversationCatalinaData(id: number, data: CatalinaConversationData): void {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => v);
  getDb().prepare(`UPDATE conversations SET ${fields} WHERE id = ?`).run(...values, id);
}

export function setMode(conversationId: number, mode: 'AI' | 'HUMAN'): void {
  getDb().prepare('UPDATE conversations SET mode = ? WHERE id = ?').run(mode, conversationId);
}

export function listConversations(): ConversationWithPreview[] {
  return getDb().prepare(`
    SELECT c.*,
      m.content AS last_message_content,
      m.role    AS last_message_role
    FROM conversations c
    LEFT JOIN messages m ON m.id = (
      SELECT id FROM messages
      WHERE conversation_id = c.id
      ORDER BY created_at DESC
      LIMIT 1
    )
    ORDER BY c.last_message_at DESC
  `).all() as unknown as ConversationWithPreview[];
}

export function deleteConversation(id: number): void {
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM zapier_actions_log WHERE conversation_id = ?').run(id);
    db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id);
    db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ── Helpers de mensajes ────────────────────────────────────────────────────

export function insertMessage(
  conversationId: number,
  role: 'user' | 'assistant' | 'human',
  content: string,
  caMessageId?: string | null
): number {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const result = db.prepare(
      `INSERT OR IGNORE INTO messages (conversation_id, role, content, ca_message_id)
       VALUES (?, ?, ?, ?)`
    ).run(conversationId, role, content, caMessageId ?? null);
    db.prepare(
      'UPDATE conversations SET last_message_at = unixepoch() WHERE id = ?'
    ).run(conversationId);
    db.exec('COMMIT');
    return Number(result.lastInsertRowid);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function updateMessageCaId(messageId: number, caMessageId: string): void {
  getDb().prepare('UPDATE messages SET ca_message_id = ? WHERE id = ?').run(caMessageId, messageId);
}

export function getMessages(conversationId: number, limit = 50): Message[] {
  const rows = getDb().prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(conversationId, limit) as unknown as Message[];
  return rows.reverse();
}

export function getRecentHistory(
  conversationId: number,
  limit = 20
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const rows = getDb().prepare(
    `SELECT * FROM messages WHERE conversation_id = ? AND role IN ('user','assistant')
     ORDER BY created_at DESC LIMIT ?`
  ).all(conversationId, limit) as unknown as Message[];
  return rows.reverse().map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content }));
}

// ── Dedup de webhooks ──────────────────────────────────────────────────────

export function wasMessageProcessed(caMessageId: string): boolean {
  return !!getDb().prepare(
    'SELECT ca_message_id FROM processed_webhook_messages WHERE ca_message_id = ?'
  ).get(caMessageId);
}

export function markMessageProcessed(caMessageId: string): void {
  getDb().prepare(
    'INSERT OR IGNORE INTO processed_webhook_messages (ca_message_id) VALUES (?)'
  ).run(caMessageId);
}

// ── Log Zapier ─────────────────────────────────────────────────────────────

export function logZapierAction(
  conversationId: number,
  action: string,
  status: 'ok' | 'error' | 'pending',
  payload?: string,
  response?: string
): void {
  getDb().prepare(
    `INSERT INTO zapier_actions_log (conversation_id, action, status, payload, response)
     VALUES (?, ?, ?, ?, ?)`
  ).run(conversationId, action, status, payload ?? null, response ?? null);
}

export function getZapierLogs(conversationId: number, limit = 10) {
  return getDb().prepare(
    'SELECT * FROM zapier_actions_log WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(conversationId, limit);
}

export default getDb;
