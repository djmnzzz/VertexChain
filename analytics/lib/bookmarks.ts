const STORAGE_KEY = 'vertexchain-bookmarks';
const MAX_BOOKMARKS = 10;

export interface Bookmark {
  id: string;
  name: string;
  url: string;
  timestamp: number;
}

export function getBookmarks(): Bookmark[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Bookmark[];
  } catch {
    return [];
  }
}

export function saveBookmark(bookmark: Omit<Bookmark, 'id' | 'timestamp'>): Bookmark | null {
  const bookmarks = getBookmarks();
  if (bookmarks.length >= MAX_BOOKMARKS) return null;
  const next: Bookmark = { ...bookmark, id: crypto.randomUUID(), timestamp: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...bookmarks, next]));
  return next;
}

export function deleteBookmark(id: string): void {
  const bookmarks = getBookmarks().filter((b) => b.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}

export function renameBookmark(id: string, name: string): void {
  const bookmarks = getBookmarks().map((b) => (b.id === id ? { ...b, name } : b));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}
