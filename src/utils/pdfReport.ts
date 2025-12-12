import jsPDF from 'jspdf';
import { Annotation } from '../types';
import { ensureDeliverablesFolder } from './storage';
import { ProjectInfo } from '../components/ProjectInfoModal';

/**
 * Helper function to format time as mm:ss
 */
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Draw a pie chart on the PDF
 * @param doc - jsPDF document
 * @param x - X position
 * @param y - Y position
 * @param radius - Radius of the pie chart
 * @param data - Array of { label, value, color } objects
 */
function drawPieChart(
  doc: jsPDF,
  x: number,
  y: number,
  radius: number,
  data: Array<{ label: string; value: number; color: string }>
): void {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return;

  let startAngle = -90; // Start from top (12 o'clock)
  const centerX = x + radius;
  const centerY = y + radius;

  data.forEach((item) => {
    const sliceAngle = (item.value / total) * 360;
    const endAngle = startAngle + sliceAngle;

    // Draw pie slice
    doc.setFillColor(item.color);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.1);

    // Convert hex color to RGB
    const rgb = hexToRgb(item.color);
    if (rgb) {
      doc.setFillColor(rgb.r, rgb.g, rgb.b);
    }

    // Draw arc
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    // Draw pie slice using lines and curves
    doc.circle(centerX, centerY, radius, 'FD'); // Fill and draw circle first

    // Clear everything outside the slice
    // We'll use a simpler approach: draw the slice as a path
    if (sliceAngle > 0) {
      // Start from center
      const startX = centerX + Math.cos(startRad) * radius;
      const startY = centerY + Math.sin(startRad) * radius;
      const endX = centerX + Math.cos(endRad) * radius;
      const endY = centerY + Math.sin(endRad) * radius;

      // Draw the slice
      doc.setFillColor(rgb?.r || 200, rgb?.g || 200, rgb?.b || 200);
      
      // Use arc method - jsPDF doesn't have perfect pie slice, so we approximate
      // Draw filled sector
      const path: Array<[number, number]> = [[centerX, centerY]];
      
      // Add points along the arc
      const steps = Math.max(5, Math.ceil(sliceAngle / 5));
      for (let i = 0; i <= steps; i++) {
        const angle = startAngle + (sliceAngle * i) / steps;
        const rad = (angle * Math.PI) / 180;
        path.push([
          centerX + Math.cos(rad) * radius,
          centerY + Math.sin(rad) * radius
        ]);
      }
      
      // Draw the filled polygon
      if (path.length > 2) {
        doc.setFillColor(rgb?.r || 200, rgb?.g || 200, rgb?.b || 200);
        // Draw filled polygon
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.1);
        
        // Draw each segment
        for (let i = 0; i < path.length - 1; i++) {
          doc.line(centerX, centerY, path[i + 1][0], path[i + 1][1]);
        }
        doc.line(path[path.length - 1][0], path[path.length - 1][1], centerX, centerY);
      }
    }

    startAngle = endAngle;
  });

  // Draw border circle
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.circle(centerX, centerY, radius);
}

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Create a pie chart as an image using HTML5 canvas, then add to PDF
 * This provides better visual quality than drawing directly in jsPDF
 */
async function createPieChartImage(
  width: number,
  height: number,
  data: Array<{ label: string; value: number; color: string }>
): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      resolve('');
      return;
    }

    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) {
      resolve('');
      return;
    }

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 10;
    let startAngle = -Math.PI / 2; // Start from top

    // Draw pie slices
    data.forEach((item) => {
      const sliceAngle = (item.value / total) * 2 * Math.PI;
      if (sliceAngle <= 0) return;

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = item.color;
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();

      startAngle += sliceAngle;
    });

    // Convert to data URL
    resolve(canvas.toDataURL('image/png'));
  });
}

/**
 * Draw a simple pie chart using filled sectors
 * Fallback method using jsPDF's basic drawing (simple but functional)
 */
function drawSimplePieChart(
  doc: jsPDF,
  x: number,
  y: number,
  radius: number,
  data: Array<{ label: string; value: number; color: string }>
): void {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return;

  let startAngle = -90; // Start from top (12 o'clock)
  const centerX = x + radius;
  const centerY = y + radius;

  data.forEach((item) => {
    const sliceAngle = (item.value / total) * 360;
    if (sliceAngle <= 0) return;

    // Convert hex to RGB
    const rgb = hexToRgb(item.color) || { r: 200, g: 200, b: 200 };
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);

    // Draw pie slice as filled arc by drawing radial lines
    const endAngle = startAngle + sliceAngle;
    const steps = Math.max(10, Math.ceil(sliceAngle / 2)); // More steps for smoother
    
    // Draw filled sector using radial approach
    for (let i = 0; i <= steps; i++) {
      const angle = startAngle + (sliceAngle * i) / steps;
      const rad = (angle * Math.PI) / 180;
      
      // Draw line from center to edge
      const edgeX = centerX + Math.cos(rad) * radius;
      const edgeY = centerY + Math.sin(rad) * radius;
      
      // Draw small filled circle at edge (approximation)
      doc.circle(edgeX, edgeY, 0.5, 'F');
      
      // Fill area by drawing lines from center
      if (i < steps) {
        for (let r = 0; r < radius; r += 1) {
          const px = centerX + Math.cos(rad) * r;
          const py = centerY + Math.sin(rad) * r;
          doc.rect(px - 0.3, py - 0.3, 0.6, 0.6, 'F');
        }
      }
    }

    startAngle = endAngle;
  });

  // Draw border circle
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.circle(centerX, centerY, radius);
}

/**
 * Draw pie chart legend with improved readability
 */
function drawPieChartLegend(
  doc: jsPDF,
  x: number,
  y: number,
  data: Array<{ label: string; value: number; color: string }>,
  total: number
): number {
  let currentY = y;
  const boxSize = 5;
  const lineHeight = 8; // Increased for better readability
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxTextWidth = pageWidth - x - boxSize - 30; // Leave more space for text

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  data.forEach((item) => {
    const percentage = ((item.value / total) * 100).toFixed(1);
    
    // Draw color box
    const rgb = hexToRgb(item.color) || { r: 200, g: 200, b: 200 };
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.rect(x, currentY, boxSize, boxSize, 'FD');
    
    // Prepare label text - ensure it fits on one line or wrap if needed
    let labelText = `${item.label}: ${item.value} (${percentage}%)`;
    const textWidth = doc.getTextWidth(labelText);
    
    // If text is too long, truncate the label but keep count and percentage
    if (textWidth > maxTextWidth) {
      let truncatedLabel = item.label;
      const suffix = `: ${item.value} (${percentage}%)`;
      const suffixWidth = doc.getTextWidth(suffix);
      const availableWidth = maxTextWidth - suffixWidth;
      
      while (doc.getTextWidth(truncatedLabel + suffix) > maxTextWidth && truncatedLabel.length > 0) {
        truncatedLabel = truncatedLabel.substring(0, truncatedLabel.length - 1);
      }
      labelText = truncatedLabel + '...' + suffix;
    }
    
    doc.text(labelText, x + boxSize + 3, currentY + boxSize - 1);
    
    currentY += lineHeight;
  });

  return currentY;
}

/**
 * Generate a PDF report from annotations
 * Includes summary statistics and screenshots of each annotation
 */
export async function generatePDFReport(
  annotations: Annotation[],
  videoFileName: string,
  videoPath?: string,
  projectInfo?: ProjectInfo | null
): Promise<void> {
  // Project info is optional - use empty strings if not provided
  if (annotations.length === 0) {
    alert('No annotations to include in report');
    return;
  }

  try {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;
    let yPosition = margin;

    // Helper to add new page if needed
    const checkPageBreak = (requiredHeight: number) => {
      if (yPosition + requiredHeight > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }
    };

    // Sort annotations by timestamp first (used throughout the report)
    const sortedAnnotations = [...annotations].sort((a, b) => a.videoTime - b.videoTime);

    // ==================== COVER PAGE ====================
    // Center content vertically
    const centerY = pageHeight / 2;

    // Title
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    const titleText = '360° Video Inspection Report';
    const titleWidth = doc.getTextWidth(titleText);
    doc.text(titleText, (pageWidth - titleWidth) / 2, centerY - 80);

    // Project Name
    if (projectInfo?.projectName) {
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      const projectNameText = `Project: ${projectInfo.projectName}`;
      const projectNameWidth = doc.getTextWidth(projectNameText);
      doc.text(projectNameText, (pageWidth - projectNameWidth) / 2, centerY - 40);
    }

    // Location
    if (projectInfo?.location) {
      doc.setFontSize(16);
      doc.setFont('helvetica', 'normal');
      const locationText = `Location: ${projectInfo.location}`;
      const locationWidth = doc.getTextWidth(locationText);
      doc.text(locationText, (pageWidth - locationWidth) / 2, centerY - 10);
    }

    // Section
    if (projectInfo?.section) {
      doc.setFontSize(16);
      doc.setFont('helvetica', 'normal');
      const sectionText = `Section: ${projectInfo.section}`;
      const sectionWidth = doc.getTextWidth(sectionText);
      doc.text(sectionText, (pageWidth - sectionWidth) / 2, centerY + 10);
    }

    // Video file name
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    const videoText = `Video: ${videoFileName}`;
    const videoWidth = doc.getTextWidth(videoText);
    doc.text(videoText, (pageWidth - videoWidth) / 2, centerY + 35);

    // Date of Capture
    if (projectInfo?.dateOfCapture) {
      try {
        doc.setFontSize(14);
        const captureDate = new Date(projectInfo.dateOfCapture).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        const dateOfCaptureText = `Date of Capture: ${captureDate}`;
        const dateOfCaptureWidth = doc.getTextWidth(dateOfCaptureText);
        doc.text(dateOfCaptureText, (pageWidth - dateOfCaptureWidth) / 2, centerY + 55);
      } catch (error) {
        // Invalid date - skip
      }
    }

    // Report Generated Date
    const reportDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const reportDateText = `Report Generated: ${reportDate}`;
    const reportDateWidth = doc.getTextWidth(reportDateText);
    doc.text(reportDateText, (pageWidth - reportDateWidth) / 2, centerY + 75);

    // ==================== INTRODUCTION PAGE ====================
    doc.addPage();
    yPosition = margin;

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Introduction', margin, yPosition);
    yPosition += 15;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const introductionText = [
      'This report presents the findings of a visual topside inspection carried out on the FPSO facility.',
      'The objective of the inspection is to identify observable structural defects, integrity concerns,',
      'safety hazards, and general degradation affecting topside equipment and systems. The inspection',
      'process follows an industry-aligned methodology and references internationally recognised standards',
      'to ensure consistency, accuracy and technical credibility.',
      '',
      'The assessment was conducted through non-intrusive, visual observation of all accessible topside',
      'areas, including structural steelwork, piping systems, mechanical equipment, electrical',
      'installations, fire and safety systems, and lifting components. No dismantling, internal',
      'inspection or pressure testing was performed. Instead, the inspection focuses solely on external',
      'condition indicators such as corrosion, coating breakdown, deformation, leakage evidence,',
      'insulation damage, improper support, loose fixings, and visible safety non-compliances.',
      '',
      'The inspection approach is guided by the principles and requirements contained within key',
      'international standards applicable to offshore topside facilities. These include structural',
      'integrity practices from DNV-RP-C203, DNV-ST-F201 and API RP 2SIM; piping and mechanical',
      'condition criteria from API 570, API 510, API 571 and ASME B31.3; electrical and',
      'instrumentation visual inspection requirements from IEC 60079, API RP 14F/14FZ and NFPA 70;',
      'and fire protection and safety system guidelines from NFPA 11/15/16, SOLAS and API RP 14C.',
      'Lifting equipment assessments draw on API RP 2D, DNV-ST-0378 and LOLER.',
      '',
      'These standards provide the framework for identifying, categorising and interpreting defects',
      'observed during the visual assessment. While the inspection remains non-destructive, the',
      'application of recognised offshore integrity standards ensures that the findings are technically',
      'grounded and aligned with global best practice. The results presented in this report therefore',
      'support informed decision-making regarding maintenance planning, risk mitigation and asset',
      'integrity management.',
    ];

    // Helper function to add justified text
    const addJustifiedText = (text: string, x: number, y: number, maxWidth: number, lineHeight: number): number => {
      // Split text into lines that fit within maxWidth
      const lines = doc.splitTextToSize(text, maxWidth);
      let currentY = y;

      lines.forEach((line: string, index: number) => {
        checkPageBreak(lineHeight);
        const words = line.trim().split(' ');
        
        // Last line is left-aligned, others are justified
        if (words.length > 1 && index < lines.length - 1) {
          // Calculate total width of words
          let totalWordsWidth = 0;
          words.forEach(w => totalWordsWidth += doc.getTextWidth(w));
          
          // Calculate spacing between words
          const spacesNeeded = words.length - 1;
          const totalSpaceWidth = maxWidth - totalWordsWidth;
          const spaceWidth = spacesNeeded > 0 ? totalSpaceWidth / spacesNeeded : 0;

          // Output words with calculated spacing
          let currentX = x;
          words.forEach((w, i) => {
            doc.text(w, currentX, currentY);
            currentX += doc.getTextWidth(w);
            if (i < words.length - 1) {
              currentX += spaceWidth;
            }
          });
        } else {
          // Left-align last line or single-word lines
          doc.text(line, x, currentY);
        }
        currentY += lineHeight;
      });

      return currentY;
    };

    // Combine introduction text into paragraphs for justification
    const introductionParagraphs = [
      'This report presents the findings of a visual topside inspection carried out on the FPSO facility. The objective of the inspection is to identify observable structural defects, integrity concerns, safety hazards, and general degradation affecting topside equipment and systems. The inspection process follows an industry-aligned methodology and references internationally recognised standards to ensure consistency, accuracy and technical credibility.',
      '',
      'The assessment was conducted through non-intrusive, visual observation of all accessible topside areas, including structural steelwork, piping systems, mechanical equipment, electrical installations, fire and safety systems, and lifting components. No dismantling, internal inspection or pressure testing was performed. Instead, the inspection focuses solely on external condition indicators such as corrosion, coating breakdown, deformation, leakage evidence, insulation damage, improper support, loose fixings, and visible safety non-compliances.',
      '',
      'The inspection approach is guided by the principles and requirements contained within key international standards applicable to offshore topside facilities. These include structural integrity practices from DNV-RP-C203, DNV-ST-F201 and API RP 2SIM; piping and mechanical condition criteria from API 570, API 510, API 571 and ASME B31.3; electrical and instrumentation visual inspection requirements from IEC 60079, API RP 14F/14FZ and NFPA 70; and fire protection and safety system guidelines from NFPA 11/15/16, SOLAS and API RP 14C. Lifting equipment assessments draw on API RP 2D, DNV-ST-0378 and LOLER.',
      '',
      'These standards provide the framework for identifying, categorising and interpreting defects observed during the visual assessment. While the inspection remains non-destructive, the application of recognised offshore integrity standards ensures that the findings are technically grounded and aligned with global best practice. The results presented in this report therefore support informed decision-making regarding maintenance planning, risk mitigation and asset integrity management.',
    ];

    introductionParagraphs.forEach((paragraph) => {
      if (paragraph.trim() === '') {
        yPosition += 6;
      } else {
        checkPageBreak(60);
        yPosition = addJustifiedText(paragraph, margin, yPosition, contentWidth, 6);
        yPosition += 3;
      }
    });

    // ==================== METHODOLOGY PAGE ====================
    doc.addPage();
    yPosition = margin;

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Methodology and Inspection Workflow', margin, yPosition);
    yPosition += 15;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const lineHeight = 6;
    const methodologyText = [
      'This inspection report has been generated using a 360° video annotation system designed to facilitate',
      'comprehensive visual inspections of industrial facilities and equipment. The methodology follows industry',
      'best practices for remote visual inspection and documentation.',
      '',
      'INSPECTION METHODOLOGY:',
      '',
      '1. Video Capture: High-resolution 360° equirectangular video footage is captured using specialized',
      '   camera equipment, providing a complete spherical view of the inspection area.',
      '',
      '2. Annotation Process: Trained inspectors review the video footage and identify defects, anomalies,',
      '   or areas of concern. Each annotation is created by:',
      '   • Selecting the specific location on the 360° sphere where the defect is visible',
      '   • Recording the timestamp at which the defect appears in the video',
      '   • Classifying the defect using standardized categories (Primary and Secondary Descriptions)',
      '   • Assessing severity using Grade (1-4) and DROPS (1-4) scoring systems',
      '   • Calculating Risk Index (Grade × DROPS) to determine priority',
      '   • Capturing a screenshot for visual documentation',
      '',
      '3. Quality Assurance: All annotations are reviewed to ensure accuracy and consistency in classification',
      '   and risk assessment.',
      '',
      '4. Reporting: This comprehensive report is generated, including:',
      '   • Summary statistics and visualizations',
      '   • Index of all defects sorted by timestamp',
      '   • Detailed documentation of each defect with screenshots and metadata',
      '',
      'STANDARDS COMPLIANCE:',
      '',
      'This inspection methodology aligns with recognized industry standards for visual inspection, including:',
      '• Systematic documentation of findings',
      '• Risk-based prioritization of defects',
      '• Traceable timestamps and location data',
      '• Comprehensive photographic evidence',
      '• Standardized classification systems',
      '',
      'The annotation system ensures that all defects are world-locked to their physical locations in the',
      '360° environment, allowing for accurate spatial reference and follow-up inspections.',
    ];

    // Combine methodology text into paragraphs for justification (but preserve structure)
    const methodologyParagraphs = [
      { text: 'This inspection report has been generated using a 360° video annotation system designed to facilitate comprehensive visual inspections of industrial facilities and equipment. The methodology follows industry best practices for remote visual inspection and documentation.', justified: true },
      { text: '', justified: false },
      { text: 'INSPECTION METHODOLOGY:', justified: false, bold: true },
      { text: '', justified: false },
      { text: '1. Video Capture: High-resolution 360° equirectangular video footage is captured using specialized camera equipment, providing a complete spherical view of the inspection area.', justified: true },
      { text: '', justified: false },
      { text: '2. Annotation Process: Trained inspectors review the video footage and identify defects, anomalies, or areas of concern. Each annotation is created by: • Selecting the specific location on the 360° sphere where the defect is visible • Recording the timestamp at which the defect appears in the video • Classifying the defect using standardized categories (Primary and Secondary Descriptions) • Assessing severity using Grade (1-4) and DROPS (1-4) scoring systems • Calculating Risk Index (Grade × DROPS) to determine priority • Capturing a screenshot for visual documentation', justified: true },
      { text: '', justified: false },
      { text: '3. Quality Assurance: All annotations are reviewed to ensure accuracy and consistency in classification and risk assessment.', justified: true },
      { text: '', justified: false },
      { text: '4. Reporting: This comprehensive report is generated, including: • Summary statistics and visualizations • Index of all defects sorted by timestamp • Detailed documentation of each defect with screenshots and metadata', justified: true },
      { text: '', justified: false },
      { text: 'STANDARDS COMPLIANCE:', justified: false, bold: true },
      { text: '', justified: false },
      { text: 'This inspection methodology aligns with recognized industry standards for visual inspection, including: • Systematic documentation of findings • Risk-based prioritization of defects • Traceable timestamps and location data • Comprehensive photographic evidence • Standardized classification systems', justified: true },
      { text: '', justified: false },
      { text: 'The annotation system ensures that all defects are world-locked to their physical locations in the 360° environment, allowing for accurate spatial reference and follow-up inspections.', justified: true },
    ];

    methodologyParagraphs.forEach((para) => {
      if (para.text.trim() === '') {
        yPosition += 3;
      } else {
        checkPageBreak(60);
        if (para.bold) {
          doc.setFont('helvetica', 'bold');
        } else {
          doc.setFont('helvetica', 'normal');
        }
        if (para.justified) {
          yPosition = addJustifiedText(para.text, margin, yPosition, contentWidth, lineHeight);
        } else {
          doc.text(para.text, margin, yPosition);
          yPosition += lineHeight;
        }
        yPosition += 3;
      }
    });

    // ==================== CODES USED DURING INSPECTION ====================
    doc.addPage();
    yPosition = margin;

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Codes Used During Inspection', margin, yPosition);
    yPosition += 15;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Standards Mapping Table (Defect Type → Standard)', margin, yPosition);
    yPosition += 12;

    // Standards mapping table
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const tableMargin = margin;
    const col1Width = 45; // Defect Category
    const col2Width = 70; // Visual Defects
    const col3Width = contentWidth - col1Width - col2Width - 10; // Applicable Standards

    // Table header
    doc.text('Defect Category', tableMargin, yPosition);
    doc.text('Visual Defects', tableMargin + col1Width, yPosition);
    doc.text('Applicable Standards', tableMargin + col1Width + col2Width, yPosition);
    yPosition += 8;

    // Draw header line
    doc.setLineWidth(0.5);
    doc.line(margin, yPosition - 2, pageWidth - margin, yPosition - 2);
    yPosition += 5;

    // Table data
    doc.setFont('helvetica', 'normal');
    const standardsData = [
      {
        category: 'Structural Steel & Platforms',
        defects: 'Corrosion, coating failure, deformation, missing bolts, handrail damage',
        standards: 'DNV-RP-C203, DNV-ST-F201, API RP 2SIM, ISO 12944',
      },
      {
        category: 'Piping Systems',
        defects: 'External corrosion, leaks, insulation damage, sagging supports',
        standards: 'API 570, API 571, API 510, ASME B31.3',
      },
      {
        category: 'Pressure Vessels',
        defects: 'External corrosion, leakage staining, coating breakdown',
        standards: 'API 510, API 571, API 579 (FFS – visual triggers)',
      },
      {
        category: 'Mechanical Equipment',
        defects: 'Oil leaks, loose foundations, damaged guards, corrosion',
        standards: 'API 610/617/618, API RP 14C, ISO 14224',
      },
      {
        category: 'Electrical Systems',
        defects: 'Corroded panels, cracked insulation, loose covers, moisture ingress',
        standards: 'IEC 60079, API RP 14F/14FZ, NFPA 70',
      },
      {
        category: 'Fire Protection Systems',
        defects: 'Blocked nozzles, corroded deluge piping, damaged extinguishers',
        standards: 'NFPA 11/15/16, SOLAS, API RP 14C',
      },
      {
        category: 'Emergency Access & Safety',
        defects: 'Obstructed routes, missing signage, damaged gratings',
        standards: 'ISO 15544, SOLAS',
      },
      {
        category: 'Lifting Equipment',
        defects: 'Corroded pad eyes, deformed hooks, missing SWL tags',
        standards: 'API RP 2D, DNV-ST-0378, LOLER',
      },
    ];

    standardsData.forEach((row, index) => {
      checkPageBreak(25);
      
      // Category (bold, first column)
      doc.setFont('helvetica', 'bold');
      const categoryLines = doc.splitTextToSize(row.category, col1Width - 2);
      doc.text(categoryLines, tableMargin, yPosition);
      const categoryHeight = categoryLines.length * 5;

      // Visual Defects (second column)
      doc.setFont('helvetica', 'normal');
      const defectsLines = doc.splitTextToSize(row.defects, col2Width - 2);
      doc.text(defectsLines, tableMargin + col1Width, yPosition);

      // Standards (third column)
      const standardsLines = doc.splitTextToSize(row.standards, col3Width - 2);
      doc.text(standardsLines, tableMargin + col1Width + col2Width, yPosition);

      yPosition += Math.max(categoryHeight, defectsLines.length * 5, standardsLines.length * 5) + 5;

      // Draw line between rows (optional)
      if (index < standardsData.length - 1) {
        doc.setLineWidth(0.2);
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, yPosition - 2, pageWidth - margin, yPosition - 2);
        yPosition += 3;
      }
    });

    // ==================== QUICK REFERENCE GUIDE PAGE ====================
    doc.addPage();
    yPosition = margin;

    // Visual Inspection Reference Card
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Topside Visual Inspection – Quick Reference Guide', margin, yPosition);
    yPosition += 15;

    doc.setFontSize(9);
    const referenceCard = [
      { title: 'Structural (DNV-RP-C203 / API 2SIM / ISO 12944)', items: [
        '• Corrosion, pitting, coating loss',
        '• Deformation: bends, dents, sagging',
        '• Missing/loose bolts or structural fixings',
        '• Damage to handrails, ladders, gratings',
        '• Fireproofing cracks or loss',
      ]},
      { title: 'Piping & Process (API 570 / API 510 / API 571)', items: [
        '• External corrosion or rusting',
        '• Stains/residue indicating leakage',
        '• Damaged/wet insulation',
        '• Dropped or misaligned supports',
        '• Vapour leaks or visible discharge',
      ]},
      { title: 'Mechanical (API 610/617/618 / API 14C)', items: [
        '• Oil leaks',
        '• Loose base bolts',
        '• Misaligned couplings',
        '• Damaged or missing guards',
        '• Corrosion on housings',
      ]},
      { title: 'Electrical (IEC 60079 / API 14F / NFPA 70)', items: [
        '• Corroded panels or fixtures',
        '• Cracked/damaged cable insulation',
        '• Moisture inside enclosures',
        '• Loose or missing covers',
        '• Faded/missing labels',
      ]},
      { title: 'Fire & Safety (NFPA 11/15/16 / SOLAS / API 14C)', items: [
        '• Blocked/corroded fire nozzles',
        '• Damaged fire extinguishers',
        '• Blocked escape routes',
        '• Broken anti-slip surfaces',
        '• Missing safety signage',
      ]},
      { title: 'Lifting (API 2D / DNV-ST-0378 / LOLER)', items: [
        '• Corroded or deformed pad eyes',
        '• Loose bolts on lifting beams',
        '• Damaged hooks/shackles',
        '• Missing SWL identification',
      ]},
    ];

    referenceCard.forEach((section) => {
      checkPageBreak(30);
      doc.setFont('helvetica', 'bold');
      doc.text(section.title, margin, yPosition);
      yPosition += 7;
      doc.setFont('helvetica', 'normal');
      section.items.forEach((item) => {
        checkPageBreak(6);
        doc.text(item, margin + 5, yPosition);
        yPosition += 6;
      });
      yPosition += 3;
    });

    // ==================== SUMMARY SECTION ====================
    doc.addPage();
    yPosition = margin; // Start at top of page
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', margin, yPosition);
    yPosition += 12;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');

    // Total Annotations
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Annotations: ${annotations.length}`, margin, yPosition);
    yPosition += 15;

    // Count annotations by description type
    const descriptionCounts: Record<string, number> = {};
    annotations.forEach((ann) => {
      const desc = ann.primaryDescription && ann.secondaryDescription
        ? `${ann.primaryDescription} - ${ann.secondaryDescription}`
        : ann.description || 'Unknown';
      descriptionCounts[desc] = (descriptionCounts[desc] || 0) + 1;
    });

    // Count annotations by Risk Index
    const riskIndexCounts: Record<number, number> = {};
    annotations.forEach((ann) => {
      const riskIndex = ann.riskIndex ?? 0;
      riskIndexCounts[riskIndex] = (riskIndexCounts[riskIndex] || 0) + 1;
    });

    // Prepare data for pie charts
    // Use distinct colors for description chart
    const distinctColors = [
      '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
      '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF6384',
    ];
    const descriptionChartData = Object.entries(descriptionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10) // Limit to top 10 for readability
      .map(([label, value], index) => ({
        label: label, // Keep full label for better readability
        value,
        color: distinctColors[index % distinctColors.length],
      }));

    const riskIndexChartData = Object.entries(riskIndexCounts)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .map(([label, value]) => {
        const riskIndex = parseInt(label);
        let color = '#cccccc';
        if (riskIndex >= 13 && riskIndex <= 16) color = '#ff0000'; // Extreme - Red
        else if (riskIndex >= 9 && riskIndex <= 12) color = '#ffa500'; // High - Orange
        else if (riskIndex >= 5 && riskIndex <= 8) color = '#ffff00'; // Medium - Yellow
        else if (riskIndex >= 1 && riskIndex <= 4) color = '#00ff00'; // Low - Green

        return {
          label: `Risk Index ${label}`,
          value,
          color,
        };
      });

    // Annotations by Description Type
    doc.setFont('helvetica', 'bold');
    doc.text('Annotations by Description Type:', margin, yPosition);
    yPosition += 12;

    // Draw pie chart for descriptions - centered
    const chartSize = 70;
    const chartX = (pageWidth - chartSize) / 2; // Center horizontally
    const chartY = yPosition;
    
    try {
      const chartImage = await createPieChartImage(chartSize * 2, chartSize * 2, descriptionChartData);
      if (chartImage) {
        checkPageBreak(chartSize + 80);
        doc.addImage(chartImage, 'PNG', chartX, chartY, chartSize, chartSize);
      }
    } catch (error) {
      console.error('Error creating description pie chart:', error);
      // Fallback: draw simple chart
      drawSimplePieChart(doc, chartX, chartY, chartSize / 2, descriptionChartData);
    }

    // Legend for description chart - place below chart, centered for readability
    const legendStartX = margin + 20;
    const legendStartY = chartY + chartSize + 10;
    yPosition = drawPieChartLegend(doc, legendStartX, legendStartY, descriptionChartData, annotations.length);
    yPosition += 15;

    checkPageBreak(100);

    // Annotations by Risk Index
    doc.setFont('helvetica', 'bold');
    doc.text('Annotations by Risk Index:', margin, yPosition);
    yPosition += 12;

    // Draw pie chart for risk index - centered
    const riskChartX = (pageWidth - chartSize) / 2; // Center horizontally
    const riskChartY = yPosition;
    
    try {
      const riskChartImage = await createPieChartImage(chartSize * 2, chartSize * 2, riskIndexChartData);
      if (riskChartImage) {
        checkPageBreak(chartSize + 80);
        doc.addImage(riskChartImage, 'PNG', riskChartX, riskChartY, chartSize, chartSize);
      }
    } catch (error) {
      console.error('Error creating risk index pie chart:', error);
      // Fallback: draw simple chart
      drawSimplePieChart(doc, riskChartX, riskChartY, chartSize / 2, riskIndexChartData);
    }

    // Legend for risk index chart - place below chart, centered for readability
    const riskLegendStartX = margin + 20;
    const riskLegendStartY = riskChartY + chartSize + 10;
    yPosition = drawPieChartLegend(doc, riskLegendStartX, riskLegendStartY, riskIndexChartData, annotations.length);
    yPosition += 15;

    // ==================== INDEX SECTION ====================
    doc.addPage();
    yPosition = margin;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Index', margin, yPosition);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('(Sorted by timestamp, defect numbers assigned by timestamp order)', margin + 25, yPosition);
    yPosition += 12;

    // Table header - adjust column positions for better spacing
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    const colDefect = margin;
    const colTime = margin + 18;
    const colDescription = margin + 48;
    const colRisk = pageWidth - margin - 25;

    doc.text('Defect #', colDefect, yPosition);
    doc.text('Time', colTime, yPosition);
    doc.text('Description', colDescription, yPosition);
    doc.text('Risk Index', colRisk, yPosition);
    yPosition += 8;

    // Draw line under header
    doc.setLineWidth(0.5);
    doc.line(margin, yPosition - 2, pageWidth - margin, yPosition - 2);
    yPosition += 5;

    // Index entries - defect numbers assigned based on timestamp order
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    sortedAnnotations.forEach((ann, index) => {
      checkPageBreak(8);

      // Defect number is assigned based on timestamp order (1, 2, 3, ...)
      const defectNumber = index + 1;
      const timeStr = formatTime(ann.videoTime);
      const description = ann.primaryDescription && ann.secondaryDescription
        ? `${ann.primaryDescription} - ${ann.secondaryDescription}`
        : ann.description || 'N/A';
      const riskIndex = ann.riskIndex ?? 'N/A';

      // Truncate description if too long, but be more generous with space
      const maxDescWidth = colRisk - colDescription - 8;
      let displayDesc = description;
      const descWidth = doc.getTextWidth(displayDesc);
      if (descWidth > maxDescWidth) {
        // Truncate and add ellipsis
        while (doc.getTextWidth(displayDesc + '...') > maxDescWidth && displayDesc.length > 0) {
          displayDesc = displayDesc.substring(0, displayDesc.length - 1);
        }
        displayDesc += '...';
      }

      doc.text(defectNumber.toString(), colDefect, yPosition);
      doc.text(timeStr, colTime, yPosition);
      doc.text(displayDesc, colDescription, yPosition);
      doc.text(riskIndex.toString(), colRisk, yPosition);
      yPosition += 8;
    });

    // ==================== DETAILED ANNOTATIONS SECTION ====================
    doc.addPage();
    yPosition = margin;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Detailed Annotations', margin, yPosition);
    yPosition += 20;

    // Add each annotation with screenshot - defect numbers based on timestamp order
    // Each defect gets its own page
    for (let i = 0; i < sortedAnnotations.length; i++) {
      const ann = sortedAnnotations[i];
      
      // Start new page for each defect (except the first one which already has a page)
      if (i > 0) {
        doc.addPage();
        yPosition = margin;
      }

      // Defect number (assigned by timestamp order)
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      const defectNumber = i + 1; // Use index + 1 (timestamp order)
      doc.text(`Defect #${defectNumber}`, margin, yPosition);
      yPosition += 15;

      // Screenshot - centered and scaled to fill width between margins
      if (ann.screenshotDataUrl) {
        try {
          // Convert data URL to image
          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = ann.screenshotDataUrl;
          });

          // Calculate image dimensions to fill width between margins
          const maxWidth = contentWidth; // Full width between margins
          const maxHeight = pageHeight - yPosition - 120; // Leave space for text below
          
          const aspectRatio = img.width / img.height;
          
          // Scale to fill width between margins (primary goal)
          let imgWidth = maxWidth;
          let imgHeight = imgWidth / aspectRatio;
          
          // If resulting height exceeds max, scale down proportionally
          if (imgHeight > maxHeight) {
            imgHeight = maxHeight;
            imgWidth = imgHeight * aspectRatio;
          }

          // Center the image horizontally
          const imgX = (pageWidth - imgWidth) / 2;
          
          // Add image
          doc.addImage(ann.screenshotDataUrl, 'PNG', imgX, yPosition, imgWidth, imgHeight);
          yPosition += imgHeight + 15;
        } catch (error) {
          console.error(`Error adding screenshot for defect ${defectNumber}:`, error);
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          doc.text('(Screenshot unavailable)', margin, yPosition);
          yPosition += 15;
        }
      } else {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('(No screenshot available)', margin, yPosition);
        yPosition += 15;
      }

      // Annotation details - written information below screenshot
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      // Time stamp
      doc.text(`Time: ${formatTime(ann.videoTime)} (${ann.videoTime.toFixed(2)}s)`, margin, yPosition);
      yPosition += 7;

      // Primary Description
      if (ann.primaryDescription) {
        doc.text(`Primary Description: ${ann.primaryDescription}`, margin, yPosition);
        yPosition += 7;
      }

      // Secondary Description
      if (ann.secondaryDescription) {
        doc.text(`Secondary Description: ${ann.secondaryDescription}`, margin, yPosition);
        yPosition += 7;
      }

      // Fallback to legacy description if no primary/secondary
      if (!ann.primaryDescription && !ann.secondaryDescription && ann.description) {
        doc.text(`Description: ${ann.description}`, margin, yPosition);
        yPosition += 7;
      }

      // Notes
      if (ann.notes) {
        doc.text(`Notes: ${ann.notes}`, margin, yPosition);
        yPosition += 7;
      } else if (ann.label) {
        // Fallback to legacy label
        doc.text(`Notes: ${ann.label}`, margin, yPosition);
        yPosition += 7;
      }

      // Grade
      if (ann.grade !== undefined && ann.grade !== 'N/A') {
        doc.text(`Grade: ${ann.grade}`, margin, yPosition);
        yPosition += 7;
      }

      // DROPS
      if (ann.drops !== undefined && ann.drops !== 'N/A') {
        doc.text(`DROPS: ${ann.drops}`, margin, yPosition);
        yPosition += 7;
      }

      // Risk Index
      if (ann.riskIndex !== undefined) {
        doc.text(`Risk Index: ${ann.riskIndex}`, margin, yPosition);
        yPosition += 7;
      }

      // Risk Level
      if (ann.riskLevel) {
        doc.text(`Risk Level: ${ann.riskLevel}`, margin, yPosition);
        yPosition += 7;
      }

      // Note: Color is intentionally excluded as per requirements

      // Space at bottom of page (screenshot already added above)
      yPosition += 10;
    }

    // Save PDF with unique timestamp to avoid EBUSY errors (file locked by OneDrive, etc.)
    const baseFileName = videoFileName.replace(/\.[^/.]+$/, '');
    const dateStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toISOString().split('T')[1].replace(/:/g, '-').split('.')[0];
    const fileName = `annotation-report-${baseFileName}-${dateStr}-${timeStr}.pdf`;
    
    // Check if we're in Electron
    if (window.electronAPI && window.electronAPI.savePDF) {
      // Get deliverables folder path if videoPath is provided
      let directory: string | undefined;
      if (videoPath) {
        try {
          directory = await ensureDeliverablesFolder(videoPath);
        } catch (error) {
          console.error('Failed to ensure deliverables folder:', error);
          // Continue without directory - will use default location
        }
      }
      
      // Convert PDF to buffer for Electron
      const pdfBlob = doc.output('blob');
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);
      
      // Retry logic for EBUSY errors (file locked by OneDrive, etc.)
      let currentFileName = fileName;
      let retries = 3;
      
      while (retries > 0) {
        try {
          await window.electronAPI.savePDF(currentFileName, buffer, directory);
      alert(`PDF report saved successfully${directory ? ` to deliverables folder` : ''}!`);
          return; // Success, exit function
        } catch (error: any) {
          // If it's an EBUSY error and we have retries left, try again with a new unique filename
          if (error?.code === 'EBUSY' && retries > 1) {
            retries--;
            // Generate a new unique filename with current timestamp
            const newTimeStr = new Date().toISOString().split('T')[1].replace(/:/g, '-').split('.')[0];
            const randomSuffix = Math.random().toString(36).substring(2, 8);
            currentFileName = `annotation-report-${baseFileName}-${dateStr}-${newTimeStr}-${randomSuffix}.pdf`;
            // Wait a bit before retrying
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
          // If not EBUSY or no retries left, throw the error
          throw error;
        }
      }
    } else {
      // Browser: download directly
      doc.save(fileName);
    }
  } catch (error) {
    console.error('Error generating PDF report:', error);
    alert(`Failed to generate PDF report: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}


