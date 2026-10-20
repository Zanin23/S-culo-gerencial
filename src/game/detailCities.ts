import { detailCitiesLoaded, registerDetailCities, type DetailCityRow } from './atlas';

// ─────────────────────────────────────────────────────────────────────────────
// Cidades de detalhe: ~4.500 localidades reais do Natural Earth 10m que
// completam as 1.203 do atlas principal. Ficam num JSON estático em /public e
// só são buscadas quando o jogador aproxima o mapa ou foca um país — o pacote
// inicial não cresce e a primeira pintura não espera por elas.
// ─────────────────────────────────────────────────────────────────────────────

interface DetailFile {
  version: number;
  source: string;
  startId: number;
  cities: DetailCityRow[];
}

let request: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeDetailCities(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function detailCitiesReady(): boolean {
  return detailCitiesLoaded();
}

/** Idempotente: a primeira chamada baixa o lote, as seguintes reaproveitam. */
export function loadDetailCities(): Promise<boolean> {
  if (detailCitiesLoaded()) return Promise.resolve(true);
  if (request) return request;
  const url = `${import.meta.env.BASE_URL}atlas/cities-detail.json`;
  request = fetch(url)
    .then((response) => (response.ok ? (response.json() as Promise<DetailFile>) : Promise.reject(new Error(String(response.status)))))
    .then((file) => {
      registerDetailCities(file.startId, file.cities, file.source);
      notify();
      return true;
    })
    .catch(() => {
      // Sem rede ou arquivo ausente: o mapa segue com as cidades principais.
      request = null;
      return false;
    });
  return request;
}
