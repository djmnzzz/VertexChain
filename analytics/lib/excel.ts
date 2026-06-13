import * as XLSX from 'xlsx';
import { categories, generateGistData } from '@/lib/utils';

type CellValue = string | number;

interface LocationRow {
  location: string;
  posts: number;
  change: string;
  dominantCategory: string;
}

interface UserRow {
  date: string;
  newUsers: number;
  returningUsers: number;
  activeUsers: number;
}

interface EngagementRow {
  gistId: string;
  category: string;
  ageDays: number;
  engagement: number;
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function buildFilename() {
  const timestamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[:]/g, '-');

  return `vertexchain-analytics-${timestamp}.xlsx`;
}

function setColumnWidths(sheet: XLSX.WorkSheet, rows: CellValue[][]) {
  const widths = rows[0].map((_, columnIndex) => {
    const max = rows.reduce((current, row) => {
      const value = row[columnIndex] == null ? '' : String(row[columnIndex]);
      return Math.max(current, value.length);
    }, 10);

    return { wch: Math.min(max + 3, 32) };
  });

  sheet['!cols'] = widths;
}

function styleHeaderRow(sheet: XLSX.WorkSheet, columnCount: number) {
  for (let index = 0; index < columnCount; index += 1) {
    const cellRef = XLSX.utils.encode_cell({ c: index, r: 0 });
    const cell = sheet[cellRef];

    if (!cell) {
      continue;
    }

    cell.s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1D4ED8' } },
      alignment: { horizontal: 'center' },
    };
  }
}

function createUsersData(days: number): UserRow[] {
  return Array.from({ length: days }).map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - index - 1));

    const returningUsers = 125 + index * 2 + (index % 4) * 7;
    const newUsers = 58 + index * 1.5 + (index % 5) * 6;

    return {
      date: formatDate(date),
      newUsers: Math.round(newUsers),
      returningUsers: Math.round(returningUsers),
      activeUsers: Math.round(newUsers + returningUsers),
    };
  });
}

function createLocationRows(): LocationRow[] {
  const cityTrend = [
    ['Abuja', 164, '+18%', 'Events'],
    ['Lagos', 221, '+12%', 'Food'],
    ['Kano', 118, '+9%', 'Markets'],
    ['Ibadan', 96, '+7%', 'Tips'],
    ['Port Harcourt', 88, '+5%', 'Transit'],
  ];

  return cityTrend.map(([location, posts, change, dominantCategory]) => ({
    location,
    posts,
    change,
    dominantCategory,
  })) as LocationRow[];
}

function createEngagementRows(): EngagementRow[] {
  return generateGistData(18)
    .sort((left, right) => right.engagement - left.engagement)
    .map((gist) => ({
      gistId: gist.id,
      category: gist.category,
      ageDays: gist.age,
      engagement: gist.engagement,
    }));
}

function createOverviewRows(
  users: UserRow[],
  locations: LocationRow[],
  engagement: EngagementRow[],
): CellValue[][] {
  const totalUsers = users.reduce((sum, row) => sum + row.activeUsers, 0);
  const avgDailyUsers = Math.round(totalUsers / users.length);
  const totalPosts = locations.reduce((sum, row) => sum + row.posts, 0);
  const topLocation = locations[0]?.location ?? 'N/A';
  const topEngagement = engagement[0]?.engagement ?? 0;

  return [
    ['Metric', 'Value', 'Notes'],
    ['Average daily users', avgDailyUsers, 'Based on the current rolling user activity window'],
    ['Tracked locations', locations.length, 'Cities included in the dashboard location table'],
    ['Total location posts', totalPosts, 'Combined post volume across the top locations sheet'],
    ['Top location', topLocation, 'Highest activity city in the workbook export'],
    ['Highest engagement', topEngagement, 'Most engaged gist entry across the export sample'],
    ['Tracked categories', categories.length, 'Dashboard categories included in analytics charts'],
  ];
}

function rowsToSheet(name: string, rows: CellValue[][]) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);

  setColumnWidths(sheet, rows);
  styleHeaderRow(sheet, rows[0]?.length ?? 0);

  return { name, sheet };
}

export function downloadAnalyticsWorkbook() {
  const users = createUsersData(14);
  const locations = createLocationRows();
  const engagement = createEngagementRows();

  const overviewRows = createOverviewRows(users, locations, engagement);
  const usersRows: CellValue[][] = [
    ['Date', 'New Users', 'Returning Users', 'Active Users'],
    ...users.map((row) => [row.date, row.newUsers, row.returningUsers, row.activeUsers]),
  ];
  const locationsRows: CellValue[][] = [
    ['Location', 'Posts', 'Weekly Change', 'Dominant Category'],
    ...locations.map((row) => [row.location, row.posts, row.change, row.dominantCategory]),
  ];
  const engagementRows: CellValue[][] = [
    ['Gist ID', 'Category', 'Age (Days)', 'Engagement'],
    ...engagement.map((row) => [row.gistId, row.category, row.ageDays, row.engagement]),
  ];

  const workbook = XLSX.utils.book_new();
  const sheets = [
    rowsToSheet('Overview', overviewRows),
    rowsToSheet('Users', usersRows),
    rowsToSheet('Locations', locationsRows),
    rowsToSheet('Engagement', engagementRows),
  ];

  sheets.forEach(({ name, sheet }) => {
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  });

  XLSX.writeFile(workbook, buildFilename(), {
    compression: true,
    cellStyles: true,
  });
}
