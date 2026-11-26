export interface PdfDocumentSection {
  heading: string;
  body: string;
}

export interface PdfDocumentSpec {
  title: string;
  subtitle?: string;
  documentCode?: string;
  metadata?: { label: string; value: string }[];
  sections: PdfDocumentSection[];
  footerNote?: string;
}

function toPdfAscii(input: string): string {
  return String(input || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00B7/g, '|')
    .replace(/\u2022/g, '*')
    .replace(/[^\x20-\x7E\n\r]/g, ' ');
}

function escapePdfString(text: string): string {
  return toPdfAscii(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(text: string, maxChars: number): string[] {
  const clean = toPdfAscii(text).replace(/\r\n/g, '\n');
  const paragraphs = clean.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    const words = trimmed.split(/\s+/);
    let current = '';
    for (const word of words) {
      if (!current) {
        current = word;
      } else if (current.length + 1 + word.length <= maxChars) {
        current += ` ${word}`;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

interface DrawOp {
  pageIndex: number;
  commands: string[];
}

export function buildPdfDocumentBuffer(spec: PdfDocumentSpec): Buffer {
  // US Letter: 612 x 792 pt
  const PAGE_W = 612;
  const PAGE_H = 792;
  const MARGIN_X = 50;
  const CONTENT_W = PAGE_W - MARGIN_X * 2;
  const BOTTOM_Y = 64;

  const pages: DrawOp[] = [{ pageIndex: 0, commands: [] }];
  let pageIdx = 0;
  let y = PAGE_H - 54;

  const currentCmds = () => pages[pageIdx].commands;

  const pushPageHeader = (isContinuation: boolean) => {
    const cmds = currentCmds();
    // Top indigo header band
    cmds.push('0.047 0.106 0.180 rg');
    cmds.push(`0 ${PAGE_H - 42} ${PAGE_W} 42 re f`);
    // Terracotta accent stripe
    cmds.push('0.788 0.392 0.180 rg');
    cmds.push(`0 ${PAGE_H - 46} ${PAGE_W} 4 re f`);

    cmds.push('BT');
    cmds.push('/F2 10 Tf');
    cmds.push('0.96 0.94 0.90 rg');
    cmds.push(`1 0 0 1 ${MARGIN_X} ${PAGE_H - 26} Tm`);
    cmds.push(`(${escapePdfString('AKADEMI VERIFIED ACADEMIC PLATFORM')}) Tj`);
    if (spec.documentCode) {
      cmds.push('/F3 9 Tf');
      cmds.push(`1 0 0 1 ${PAGE_W - 190} ${PAGE_H - 26} Tm`);
      cmds.push(`(${escapePdfString(spec.documentCode)}) Tj`);
    }
    cmds.push('ET');

    if (isContinuation) {
      cmds.push('BT');
      cmds.push('/F1 9 Tf');
      cmds.push('0.35 0.38 0.44 rg');
      cmds.push(`1 0 0 1 ${MARGIN_X} ${PAGE_H - 68} Tm`);
      cmds.push(`(${escapePdfString(`${spec.title} (continued)`)}) Tj`);
      cmds.push('ET');
      y = PAGE_H - 90;
    } else {
      y = PAGE_H - 76;
    }
  };

  const ensureSpace = (neededPt: number) => {
    if (y - neededPt < BOTTOM_Y) {
      pageIdx += 1;
      pages.push({ pageIndex: pageIdx, commands: [] });
      pushPageHeader(true);
    }
  };

  pushPageHeader(false);

  // Title
  const titleLines = wrapText(spec.title, 54);
  for (const line of titleLines) {
    ensureSpace(24);
    currentCmds().push('BT');
    currentCmds().push('/F2 17 Tf');
    currentCmds().push('0.047 0.106 0.180 rg');
    currentCmds().push(`1 0 0 1 ${MARGIN_X} ${y} Tm`);
    currentCmds().push(`(${escapePdfString(line)}) Tj`);
    currentCmds().push('ET');
    y -= 22;
  }

  if (spec.subtitle) {
    const subLines = wrapText(spec.subtitle, 78);
    for (const line of subLines) {
      ensureSpace(16);
      currentCmds().push('BT');
      currentCmds().push('/F1 10.5 Tf');
      currentCmds().push('0.32 0.36 0.42 rg');
      currentCmds().push(`1 0 0 1 ${MARGIN_X} ${y} Tm`);
      currentCmds().push(`(${escapePdfString(line)}) Tj`);
      currentCmds().push('ET');
      y -= 15;
    }
  }

  y -= 8;

  // Metadata Box
  if (spec.metadata && spec.metadata.length > 0) {
    const rows = spec.metadata.map((m) => ({
      label: `${m.label}:`,
      lines: wrapText(m.value, 64),
    }));
    const totalMetaLines = rows.reduce((acc, r) => acc + Math.max(1, r.lines.length), 0);
    const boxH = 16 + totalMetaLines * 15;
    ensureSpace(boxH + 12);

    // Subtle papyrus fill + warm border
    currentCmds().push('0.965 0.953 0.922 rg');
    currentCmds().push(`${MARGIN_X} ${y - boxH} ${CONTENT_W} ${boxH} re f`);
    currentCmds().push('0.80 0.76 0.68 RG');
    currentCmds().push('0.8 w');
    currentCmds().push(`${MARGIN_X} ${y - boxH} ${CONTENT_W} ${boxH} re S`);

    let my = y - 18;
    for (const row of rows) {
      currentCmds().push('BT');
      currentCmds().push('/F2 9.5 Tf');
      currentCmds().push('0.18 0.24 0.31 rg');
      currentCmds().push(`1 0 0 1 ${MARGIN_X + 12} ${my} Tm`);
      currentCmds().push(`(${escapePdfString(row.label)}) Tj`);
      currentCmds().push('ET');

      for (let i = 0; i < row.lines.length; i += 1) {
        currentCmds().push('BT');
        currentCmds().push('/F1 9.5 Tf');
        currentCmds().push('0.05 0.11 0.18 rg');
        currentCmds().push(`1 0 0 1 ${MARGIN_X + 152} ${my} Tm`);
        currentCmds().push(`(${escapePdfString(row.lines[i] || '-')}) Tj`);
        currentCmds().push('ET');
        my -= 15;
      }
      if (row.lines.length === 0) my -= 15;
    }
    y = y - boxH - 18;
  }

  // Sections
  for (const section of spec.sections) {
    ensureSpace(36);
    currentCmds().push('0.82 0.78 0.72 RG');
    currentCmds().push('0.6 w');
    currentCmds().push(`${MARGIN_X} ${y + 6} m ${PAGE_W - MARGIN_X} ${y + 6} l S`);
    y -= 10;

    currentCmds().push('BT');
    currentCmds().push('/F2 11.5 Tf');
    currentCmds().push('0.643 0.290 0.110 rg');
    currentCmds().push(`1 0 0 1 ${MARGIN_X} ${y} Tm`);
    currentCmds().push(`(${escapePdfString(section.heading)}) Tj`);
    currentCmds().push('ET');
    y -= 18;

    const bodyLines = wrapText(section.body, 86);
    for (const line of bodyLines) {
      if (!line) {
        y -= 8;
        continue;
      }
      ensureSpace(16);
      currentCmds().push('BT');
      currentCmds().push('/F1 10.5 Tf');
      currentCmds().push('0.08 0.12 0.18 rg');
      currentCmds().push(`1 0 0 1 ${MARGIN_X} ${y} Tm`);
      currentCmds().push(`(${escapePdfString(line)}) Tj`);
      currentCmds().push('ET');
      y -= 15;
    }
    y -= 10;
  }

  // Page footers
  const totalPages = pages.length;
  for (let i = 0; i < totalPages; i += 1) {
    const cmds = pages[i].commands;
    cmds.push('0.82 0.78 0.72 RG');
    cmds.push('0.5 w');
    cmds.push(`${MARGIN_X} 44 m ${PAGE_W - MARGIN_X} 44 l S`);

    cmds.push('BT');
    cmds.push('/F1 8.5 Tf');
    cmds.push('0.40 0.43 0.48 rg');
    cmds.push(`1 0 0 1 ${MARGIN_X} 30 Tm`);
    cmds.push(
      `(${escapePdfString(
        spec.footerNote || 'Official Akademi Document · Issued under verified credential controls'
      )}) Tj`
    );
    cmds.push(`1 0 0 1 ${PAGE_W - 102} 30 Tm`);
    cmds.push(`(${escapePdfString(`Page ${i + 1} of ${totalPages}`)}) Tj`);
    cmds.push('ET');
  }

  // Assemble PDF 1.4 objects cleanly
  // Obj 1: Catalog
  // Obj 2: Pages
  // Obj 3: Helvetica (F1)
  // Obj 4: Helvetica-Bold (F2)
  // Obj 5: Courier (F3)
  // Then for each page i: Page object (6 + 2*i), Content stream object (7 + 2*i)
  const objects: string[] = [];
  const pageObjNums: number[] = [];

  for (let i = 0; i < pages.length; i += 1) {
    pageObjNums.push(6 + i * 2);
  }

  objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${
      pages.length
    } >>\nendobj\n`
  );
  objects.push(`3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);
  objects.push(`4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`);
  objects.push(`5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n`);

  for (let i = 0; i < pages.length; i += 1) {
    const pageObjNum = 6 + i * 2;
    const streamObjNum = 7 + i * 2;
    const streamStr = pages[i].commands.join('\n') + '\n';
    const streamLen = Buffer.byteLength(streamStr, 'latin1');

    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${streamObjNum} 0 R >>\nendobj\n`
    );
    objects.push(
      `${streamObjNum} 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamStr}endstream\nendobj\n`
    );
  }

  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const chunks: Buffer[] = [Buffer.from(header, 'latin1')];
  const offsets: number[] = [0];
  let cursor = chunks[0].length;

  for (const objStr of objects) {
    offsets.push(cursor);
    const buf = Buffer.from(objStr, 'latin1');
    chunks.push(buf);
    cursor += buf.length;
  }

  const xrefStart = cursor;
  const totalObjects = objects.length + 1;
  let xref = `xref\n0 ${totalObjects}\n`;
  xref += `0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'latin1'));

  return Buffer.concat(chunks);
}
