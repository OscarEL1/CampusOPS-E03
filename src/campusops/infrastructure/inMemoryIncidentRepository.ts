import type { Incident, IncidentRepository } from '../domain/incident';

const incidents: readonly Incident[] = [
  {
    id: 'campus-inc-001',
    title: 'Fuga de agua en laboratorio norte',
    category: 'water',
    description: 'Se observa una fuga cercana al área de lavabos del laboratorio.',
    location: 'Laboratorio norte, edificio B',
    status: 'open',
  },
  {
    id: 'campus-inc-002',
    title: 'Conectividad intermitente en biblioteca',
    category: 'connectivity',
    description: 'La conexión inalámbrica se interrumpe durante periodos breves.',
    location: 'Biblioteca, segundo piso',
    status: 'assigned',
  },
];

export class InMemoryIncidentRepository implements IncidentRepository {
  async list(): Promise<readonly Incident[]> {
    return incidents;
  }

  async getById(id: string): Promise<Incident | null> {
    return incidents.find((incident) => incident.id === id) ?? null;
  }
}
