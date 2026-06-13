const STORAGE_KEY = 'vertexchain-annotations';

export interface Annotation {
  id: string;
  chartId: string;
  date: string;
  text: string;
}

export function getAnnotations(chartId?: string): Annotation[] {
  if (typeof window === 'undefined') return [];
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Annotation[];
    return chartId ? all.filter((a) => a.chartId === chartId) : all;
  } catch {
    return [];
  }
}

export function saveAnnotation(annotation: Omit<Annotation, 'id'>): Annotation {
  const all = getAnnotations();
  const next: Annotation = { ...annotation, id: crypto.randomUUID() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...all, next]));
  return next;
}

export function updateAnnotation(id: string, patch: Partial<Pick<Annotation, 'text' | 'date'>>): void {
  const all = getAnnotations().map((a) => (a.id === id ? { ...a, ...patch } : a));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function deleteAnnotation(id: string): void {
  const all = getAnnotations().filter((a) => a.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
