import type { Incident, IncidentRepository } from '../domain/incident';

/** Fictional campus backlog; no real person, location or credential appears here. */
const SEED_INCIDENTS: readonly Incident[] = [
  {
    id: 'campus-inc-001',
    title: 'Fuga de agua en laboratorio norte',
    category: 'water',
    description: 'Se observa una fuga cercana al área de lavabos del laboratorio.',
    location: 'Laboratorio norte, edificio B',
    status: 'open',
    reporterId: 'campus-reporter-201',
    assignedTechnicianId: null,
  },
  {
    id: 'campus-inc-002',
    title: 'Conectividad intermitente en biblioteca',
    category: 'connectivity',
    description: 'La conexión inalámbrica se interrumpe durante periodos breves.',
    location: 'Biblioteca, segundo piso',
    status: 'assigned',
    reporterId: 'campus-reporter-202',
    assignedTechnicianId: 'campus-tech-301',
  },
  {
    id: 'campus-inc-003',
    title: 'Contacto eléctrico sin cubierta en taller',
    category: 'electrical',
    description: 'Un contacto del taller quedó sin cubierta después de una reparación.',
    location: 'Taller de mantenimiento, planta baja',
    status: 'in_progress',
    reporterId: 'campus-reporter-201',
    assignedTechnicianId: 'campus-tech-302',
  },
];

export class InMemoryIncidentRepository implements IncidentRepository {
  private incidents: readonly Incident[] = SEED_INCIDENTS;

  async list(): Promise<readonly Incident[]> {
    return this.incidents;
  }

  async getById(id: string): Promise<Incident | null> {
    return this.incidents.find((incident) => incident.id === id) ?? null;
  }

  async saveAssignment(id: string, technicianId: string | null): Promise<Incident | null> {
    const current = this.incidents.find((incident) => incident.id === id);
    if (current === undefined) {
      return null;
    }
    const updated: Incident = {
      ...current,
      assignedTechnicianId: technicianId,
      status: technicianId === null ? 'open' : 'assigned',
    };
    this.incidents = this.incidents.map((incident) => (incident.id === id ? updated : incident));
    return updated;
  }
}
