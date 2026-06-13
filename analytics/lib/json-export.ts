import { categories, generateGistData } from '@/lib/utils';

interface ExportMetadata {
  timestamp: string;
  version: string;
  source: string;
}

interface ExportSections {
  overview: {
    totalGists: number;
    categoriesTracked: number;
    topCategory: string;
  };
  users: Array<{
    date: string;
    newUsers: number;
    returningUsers: number;
  }>;
  locations: Array<{
    location: string;
    values: number[];
    direction: 'up' | 'down';
  }>;
  engagement: Array<{
    id: string;
    age: number;
    engagement: number;
    category: string;
  }>;
}

export interface AnalyticsJsonExport {
  metadata: ExportMetadata;
  sections: ExportSections;
}

function buildFilename() {
  const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[:]/g, '-');
  return `analytics-export-${stamp}.json`;
}

function buildUsersData() {
  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));

    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      newUsers: 42 + index * 6 + (index % 2) * 4,
      returningUsers: 98 + index * 7 + (index % 3) * 5,
    };
  });
}

function buildLocationsData() {
  const locations = [
    { location: 'Abuja', values: [10, 20, 30, 25, 40, 50, 60] },
    { location: 'Lagos', values: [60, 50, 40, 35, 30, 20, 10] },
  ];

  return locations.map((row) => ({
    ...row,
    direction: row.values.at(-1)! > row.values[0] ? 'up' as const : 'down' as const,
  }));
}

export function createAnalyticsJsonExport(): AnalyticsJsonExport {
  const engagement = generateGistData(24);
  const users = buildUsersData();
  const locations = buildLocationsData();
  const totals = engagement.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + 1;
    return acc;
  }, {});

  const topCategory =
    Object.entries(totals).sort((left, right) => right[1] - left[1])[0]?.[0] ?? categories[0];

  return {
    metadata: {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      source: 'VertexChain Analytics Dashboard',
    },
    sections: {
      overview: {
        totalGists: engagement.length,
        categoriesTracked: categories.length,
        topCategory,
      },
      users,
      locations,
      engagement: engagement.map((item) => ({
        id: item.id,
        age: item.age,
        engagement: item.engagement,
        category: item.category,
      })),
    },
  };
}

export function isAnalyticsJsonExport(value: unknown): value is AnalyticsJsonExport {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const exportValue = value as Partial<AnalyticsJsonExport>;

  return Boolean(
    exportValue.metadata &&
      exportValue.sections &&
      typeof exportValue.metadata.timestamp === 'string' &&
      typeof exportValue.metadata.version === 'string' &&
      typeof exportValue.metadata.source === 'string' &&
      exportValue.sections.overview &&
      Array.isArray(exportValue.sections.users) &&
      Array.isArray(exportValue.sections.locations) &&
      Array.isArray(exportValue.sections.engagement),
  );
}

export function downloadAnalyticsJson(prettyPrint: boolean) {
  const payload = createAnalyticsJsonExport();

  if (!isAnalyticsJsonExport(payload)) {
    throw new Error('Invalid analytics export payload');
  }

  const contents = JSON.stringify(payload, null, prettyPrint ? 2 : 0);
  const blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = buildFilename();
  link.click();
  URL.revokeObjectURL(url);
}
