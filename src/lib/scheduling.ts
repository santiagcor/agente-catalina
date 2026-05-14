import type { Conversation } from './db';
import { callZapierTool, zapierMcpConfigured } from './zapier/mcp-client';

export interface SchedulingOutput {
  message_to_send: string;
  cita_estado: 'pendiente' | 'propuesta' | 'confirmada';
  cita_preferencia: string;
  meet_link: string | null;
}

// Parse a loose time preference into an ISO datetime range for calendar lookup
function buildTimeRange(preference: string): { start: string; end: string } | null {
  const now = new Date();
  const text = preference.toLowerCase();

  // Try to extract a day-of-week
  const days: Record<string, number> = {
    lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
    jueves: 4, viernes: 5,
  };
  let targetDate: Date | null = null;
  for (const [word, dow] of Object.entries(days)) {
    if (text.includes(word)) {
      const diff = (dow - now.getDay() + 7) % 7 || 7;
      targetDate = new Date(now);
      targetDate.setDate(now.getDate() + diff);
      break;
    }
  }
  if (!targetDate) {
    // "mañana"
    if (text.includes('mañana')) {
      targetDate = new Date(now);
      targetDate.setDate(now.getDate() + 1);
    } else {
      return null;
    }
  }

  // Extract hour
  let hour = 10; // default morning
  const amMatch = text.match(/(\d{1,2})\s*(am|a\.m)/i);
  const pmMatch = text.match(/(\d{1,2})\s*(pm|p\.m)/i);
  const rawHour = text.match(/(\d{1,2})\s*(:|h)/);
  if (amMatch) hour = parseInt(amMatch[1]);
  else if (pmMatch) hour = parseInt(pmMatch[1]) + (parseInt(pmMatch[1]) < 12 ? 12 : 0);
  else if (rawHour) hour = parseInt(rawHour[1]);
  else if (text.includes('tarde')) hour = 14;
  else if (text.includes('mañana')) hour = 9;

  // Clamp to business hours
  hour = Math.max(8, Math.min(17, hour));

  targetDate.setHours(hour, 0, 0, 0);
  const endDate = new Date(targetDate);
  endDate.setHours(hour + 1);

  return {
    start: targetDate.toISOString(),
    end: endDate.toISOString(),
  };
}

export async function callSchedulingAgent(
  userMessage: string,
  convo: Conversation
): Promise<SchedulingOutput | null> {
  if (!zapierMcpConfigured()) {
    console.log('[scheduling] MCP no configurado, saltando agendamiento');
    return null;
  }

  const preference = convo.catalina_cita_preferencia || userMessage;
  const timeRange = buildTimeRange(preference);

  if (!timeRange) {
    // Can't parse a date yet — ask client to be more specific
    return {
      message_to_send: 'Para agendar tu reunión con el asesor, ¿qué día y hora te quedaría bien? Trabajamos lunes a viernes de 8am a 6pm.',
      cita_estado: 'pendiente',
      cita_preferencia: preference,
      meet_link: null,
    };
  }

  console.log(`[scheduling] verificando disponibilidad: ${timeRange.start} → ${timeRange.end}`);

  try {
    // 1. Check availability
    const events = await callZapierTool('google_calendar_find_events', {
      start_time: timeRange.start,
      end_time: timeRange.end,
    }) as Record<string, unknown>;

    const busy = Array.isArray(events) ? events.length > 0 : !!(events?.id || events?.summary);
    console.log(`[scheduling] slot ${busy ? 'OCUPADO' : 'LIBRE'}`);

    if (busy) {
      // Slot taken — suggest next available slot (same day +1h or next day)
      const alt = new Date(timeRange.start);
      alt.setHours(alt.getHours() + 1);
      if (alt.getHours() > 17) {
        alt.setDate(alt.getDate() + 1);
        alt.setHours(9, 0, 0, 0);
      }
      const altStr = alt.toLocaleString('es-CO', { weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: true });
      return {
        message_to_send: `Ese horario ya está ocupado. Te propongo el ${altStr}. ¿Te funciona?`,
        cita_estado: 'propuesta',
        cita_preferencia: preference,
        meet_link: null,
      };
    }

    // 2. Create the event
    const startStr = new Date(timeRange.start).toLocaleString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: true });
    const titulo = `Reunión Solar - ${convo.catalina_nombre || 'Cliente'} (${convo.catalina_ciudad || ''})`;
    const descripcion = `Consumo: ${convo.catalina_consumo || '?'} kWh | Tipo: ${convo.catalina_tipo_persona || '?'} | Teléfono: ${convo.phone}`;

    const created = await callZapierTool('google_calendar_create_detailed_event', {
      summary: titulo,
      description: descripcion,
      start_time: timeRange.start,
      end_time: timeRange.end,
      add_google_meet: true,
    }) as Record<string, unknown>;

    const meetLink = (created?.hangoutLink || created?.meet_link || created?.conferenceData?.entryPoints?.[0]?.uri || null) as string | null;
    console.log(`[scheduling] evento creado, meet: ${meetLink}`);

    return {
      message_to_send: `Perfecto, ${convo.catalina_nombre ? convo.catalina_nombre + '.' : ''} Tu reunión con un asesor de Energreen está agendada para el ${startStr}. Te enviará el enlace a la brevedad.`,
      cita_estado: 'confirmada',
      cita_preferencia: timeRange.start,
      meet_link: meetLink,
    };
  } catch (err) {
    console.error('[scheduling] error con Google Calendar:', err);
    // Graceful fallback — human will confirm
    return {
      message_to_send: `Perfecto, ${convo.catalina_nombre ? convo.catalina_nombre + ',' : ''} registré tu preferencia para ${preference}. Un asesor de Energreen confirmará tu cita a la brevedad.`,
      cita_estado: 'propuesta',
      cita_preferencia: preference,
      meet_link: null,
    };
  }
}

export function shouldTriggerScheduling(
  cita_estado: string,
  _new_status_id: string
): boolean {
  // Only fire when Catalina has recorded a concrete preference from the client.
  // 'propuesta' = client gave a time, Catalina stored it, now we check calendar.
  return cita_estado === 'propuesta';
}
