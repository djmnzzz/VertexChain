import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export interface ReportSection {
  title: string;
  element: HTMLElement;
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildFilename() {
  const timestamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[:]/g, '-');

  return `vertexchain-analytics-report-${timestamp}.pdf`;
}

export function getDashboardDateRange(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - (days - 1));

  return `${formatDate(start)} - ${formatDate(end)}`;
}

export async function generatePdfReport(
  sections: ReportSection[],
  dateRange: string,
  onProgress?: (progress: number) => void,
) {
  const pdf = new jsPDF({
    format: 'a4',
    unit: 'mm',
    orientation: 'portrait',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;

  pdf.setFillColor(30, 41, 59);
  pdf.rect(0, 0, pageWidth, 34, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(24);
  pdf.text('VertexChain', margin, 16);
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Analytics dashboard report', margin, 24);

  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text('Dashboard Snapshot', margin, 52);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(12);
  pdf.text(`Date range: ${dateRange}`, margin, 64);
  pdf.text(`Generated: ${formatDate(new Date())}`, margin, 72);

  pdf.setDrawColor(129, 140, 248);
  pdf.roundedRect(margin, 84, pageWidth - margin * 2, 34, 4, 4);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text('Included sections', margin + 6, 96);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  sections.forEach((section, index) => {
    pdf.text(`${index + 1}. ${section.title}`, margin + 6, 105 + index * 7);
  });

  const total = Math.max(sections.length, 1);

  for (const [index, section] of sections.entries()) {
    pdf.addPage();
    pdf.setTextColor(15, 23, 42);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text(section.title, margin, 18);
    pdf.setDrawColor(226, 232, 240);
    pdf.line(margin, 22, pageWidth - margin, 22);

    const canvas = await html2canvas(section.element, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
    });

    const imgWidth = pageWidth - margin * 2;
    const rawHeight = (canvas.height * imgWidth) / canvas.width;
    const maxHeight = pageHeight - 40;
    const imgHeight = Math.min(rawHeight, maxHeight);
    const imgX = margin;
    const imgY = 28;

    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', imgX, imgY, imgWidth, imgHeight, undefined, 'FAST');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Section ${index + 1} of ${sections.length}`, margin, pageHeight - 10);

    onProgress?.(Math.round(((index + 1) / total) * 100));
  }

  pdf.save(buildFilename());
}
