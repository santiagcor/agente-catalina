import {
  getConversationById,
  updateConversationCatalinaData,
} from '@/lib/db';
import type { CatalinaOutput } from '@/lib/openrouter';

// ── Base y headers ─────────────────────────────────────────────────────────

function kommoBase(): string {
  return `https://${process.env.KOMMO_SUBDOMAIN}.kommo.com/api/v4`;
}

function kommoHeaders() {
  return {
    'Authorization': `Bearer ${process.env.KOMMO_LONG_LIVED_TOKEN ?? ''}`,
    'Content-Type': 'application/json',
  };
}

// ── Contactos ──────────────────────────────────────────────────────────────

export async function findContactByPhone(phone: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${kommoBase()}/contacts?query=${phone}`, {
    headers: kommoHeaders(),
  });
  if (res.status === 204) return null;
  const json = await res.json();
  return (json?._embedded?.contacts?.[0] as Record<string, unknown>) ?? null;
}

export async function createContact(data: { name: string; phone: string }): Promise<number> {
  const res = await fetch(`${kommoBase()}/contacts`, {
    method: 'POST',
    headers: kommoHeaders(),
    body: JSON.stringify([{
      name: data.name || data.phone,
      custom_fields_values: [{
        field_code: 'PHONE',
        values: [{ value: data.phone, enum_code: 'WORK' }],
      }],
    }]),
  });
  const json = await res.json();
  return json?._embedded?.contacts?.[0]?.id as number;
}

// ── Leads ──────────────────────────────────────────────────────────────────

export async function createLead(data: {
  contactId: number;
  name: string;
  statusId: string;
  pipelineId: number;
  temperature: string;
}): Promise<number> {
  const res = await fetch(`${kommoBase()}/leads`, {
    method: 'POST',
    headers: kommoHeaders(),
    body: JSON.stringify([{
      name: `Solar - ${data.name || 'Lead'}`,
      status_id: parseInt(data.statusId) || undefined,
      pipeline_id: data.pipelineId,
      _embedded: {
        contacts: [{ id: data.contactId }],
        tags: [{ name: `temperatura:${data.temperature}` }],
      },
    }]),
  });
  const json = await res.json();
  return json?._embedded?.leads?.[0]?.id as number;
}

export async function updateLeadStatus(
  leadId: number,
  statusId: string,
  pipelineId: number
): Promise<void> {
  await fetch(`${kommoBase()}/leads/${leadId}`, {
    method: 'PATCH',
    headers: kommoHeaders(),
    body: JSON.stringify({
      status_id: parseInt(statusId) || undefined,
      pipeline_id: pipelineId,
    }),
  });
}

export async function addNoteToLead(leadId: number, text: string): Promise<void> {
  await fetch(`${kommoBase()}/leads/notes`, {
    method: 'POST',
    headers: kommoHeaders(),
    body: JSON.stringify([{
      entity_id: leadId,
      note_type: 'common',
      params: { text },
    }]),
  });
}

/** Test de conexión */
export async function getAccountInfo(): Promise<{ name: string; subdomain: string }> {
  const res = await fetch(`${kommoBase()}/account`, { headers: kommoHeaders() });
  if (!res.ok) throw new Error(`Kommo ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return { name: json.name as string, subdomain: json.subdomain as string };
}

// ── Orquestador ────────────────────────────────────────────────────────────

export async function syncToKommo(
  conversationId: number,
  phone: string,
  name: string | null,
  catalinaOutput: CatalinaOutput
): Promise<void> {
  const pipelineId = parseInt(process.env.KOMMO_PIPELINE_ID ?? '0');
  const convo = getConversationById(conversationId);
  if (!convo) return;

  // Buscar o crear contacto
  let contactId = convo.kommo_contact_id;
  if (!contactId) {
    const existing = await findContactByPhone(phone);
    if (existing) {
      contactId = existing.id as number;
    } else {
      contactId = await createContact({
        name: catalinaOutput.nombre || name || phone,
        phone,
      });
    }
    updateConversationCatalinaData(conversationId, { kommo_contact_id: contactId });
  }

  // Buscar o crear lead
  let leadId = convo.kommo_lead_id;
  if (!leadId) {
    leadId = await createLead({
      contactId,
      name: catalinaOutput.nombre || name || phone,
      statusId: catalinaOutput.new_status_id,
      pipelineId,
      temperature: catalinaOutput.lead_temperature,
    });
    updateConversationCatalinaData(conversationId, { kommo_lead_id: leadId });
  } else {
    // Siempre actualizar el estado en Kommo — la comparación con DB no es fiable
    // porque updateConversationCatalinaData ya actualizó kommo_status_id antes de esta llamada
    if (catalinaOutput.new_status_id) {
      await updateLeadStatus(leadId, catalinaOutput.new_status_id, pipelineId);
    }
  }

}
