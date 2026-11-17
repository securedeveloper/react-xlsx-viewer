// Generated stress and security files for test/browser/hostile.browser.test.tsx (docs/api.md §10, §11.3).
// Each file is built at test time, byte by byte, so nothing hostile is committed and every case is
// readable here: a tiny zip writer, the minimal xlsx parts, and one function per attack.

const enc = new TextEncoder();

// ---------------------------------------------------------------------------
// Zip writer: stored or deflated entries, optional lies in the headers.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface ZipEntry {
  name: string;
  data: Uint8Array | string;
  /** Default: deflate. */
  method?: 'store' | 'deflate' | number;
  /** Write a wrong CRC-32 into the headers. */
  badCrc?: boolean;
  /** Set the "encrypted" flag. */
  encrypted?: boolean;
  /** Declare this uncompressed size instead of the real one. */
  declaredSize?: number;
}

export async function zip(entries: ZipEntry[]): Promise<Uint8Array> {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const raw = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    const method = e.method === undefined || e.method === 'deflate' ? 8 : e.method === 'store' ? 0 : e.method;
    const body = method === 8 ? await deflateRaw(raw) : raw;
    const crc = e.badCrc ? (crc32(raw) ^ 0xdeadbeef) >>> 0 : crc32(raw);
    const size = e.declaredSize ?? raw.length;
    const name = enc.encode(e.name);
    const flags = (e.encrypted ? 1 : 0) | 0x0800; // UTF-8 names
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, flags, true);
    lh.setUint16(8, method, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, body.length, true);
    lh.setUint32(22, size, true);
    lh.setUint16(26, name.length, true);
    local.push(new Uint8Array(lh.buffer), name, body);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, flags, true);
    ch.setUint16(10, method, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, body.length, true);
    ch.setUint32(24, size, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const parts = [...local, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Minimal xlsx parts.

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';

export const xmlEscape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface XlsxParts {
  sheetXml?: string | Uint8Array;
  sheetName?: string;
  sheetRels?: string;
  sharedStrings?: string;
  styles?: string;
  workbookExtra?: string;
  workbookRelsExtra?: string;
  contentTypesExtra?: string;
  extra?: ZipEntry[];
  /** Override an entry's options by name (for CRC, method, flags). */
  entry?: Record<string, Partial<ZipEntry>>;
  /** Leave out these parts. */
  omit?: string[];
}

export const sheet = (sheetData: string, after = '', before = ''): string =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}" xmlns:r="${R}">${before}<sheetData>${sheetData}</sheetData>${after}</worksheet>`;

export function xlsx(p: XlsxParts = {}): Promise<Uint8Array> {
  const files: ZipEntry[] = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>${p.sharedStrings ? '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' : ''}${p.styles ? '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' : ''}${p.contentTypesExtra ?? ''}</Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}" xmlns:r="${R}"><sheets><sheet name="${xmlEscape(p.sheetName ?? 'Sheet1')}" sheetId="1" r:id="rId1"/></sheets>${p.workbookExtra ?? ''}</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/>${p.sharedStrings ? `<Relationship Id="rId2" Type="${R}/sharedStrings" Target="sharedStrings.xml"/>` : ''}${p.styles ? `<Relationship Id="rId3" Type="${R}/styles" Target="styles.xml"/>` : ''}${p.workbookRelsExtra ?? ''}</Relationships>`,
    },
    { name: 'xl/worksheets/sheet1.xml', data: p.sheetXml ?? sheet('<row r="1"><c r="A1"><v>1</v></c></row>') },
  ];
  if (p.sheetRels) files.push({ name: 'xl/worksheets/_rels/sheet1.xml.rels', data: p.sheetRels });
  if (p.sharedStrings) files.push({ name: 'xl/sharedStrings.xml', data: p.sharedStrings });
  if (p.styles) files.push({ name: 'xl/styles.xml', data: p.styles });
  files.push(...(p.extra ?? []));
  return zip(files.filter((f) => !p.omit?.includes(f.name)).map((f) => ({ ...f, ...p.entry?.[f.name] })));
}

export const rels = (items: Array<{ id: string; type: string; target: string; external?: boolean }>): string =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG}">${items
    .map((i) => `<Relationship Id="${i.id}" Type="${R}/${i.type}" Target="${xmlEscape(i.target)}"${i.external ? ' TargetMode="External"' : ''}/>`)
    .join('')}</Relationships>`;

export const inlineStr = (ref: string, text: string, s?: number): string => `<c r="${ref}" t="inlineStr"${s === undefined ? '' : ` s="${s}"`}><is><t>${xmlEscape(text)}</t></is></c>`;

// ---------------------------------------------------------------------------
// The attacks.

/** sheet1.xml inflates to `mb` MB of spaces: a compression ratio above the reader's maxRatio (1000). */
export function zipBomb(mb = 32): Promise<Uint8Array> {
  const xml = sheet('<row r="1"><c r="A1"><v>1</v></c></row>');
  const at = xml.indexOf('<sheetData>');
  const head = enc.encode(xml.slice(0, at));
  const tail = enc.encode(xml.slice(at));
  const body = new Uint8Array(head.length + mb * 1024 * 1024 + tail.length).fill(0x20);
  body.set(head);
  body.set(tail, body.length - tail.length);
  return xlsx({ sheetXml: body });
}

/** An entry that declares a 4 GB uncompressed size (above maxEntryBytes) without containing it. */
export function declaredHugeEntry(): Promise<Uint8Array> {
  return xlsx({ entry: { 'xl/worksheets/sheet1.xml': { declaredSize: 0xffff_fff0 } } });
}

/** `count` distinct shared strings. */
export function manySharedStrings(count: number): Promise<Uint8Array> {
  const si = Array.from({ length: count }, (_, i) => `<si><t>s${i}</t></si>`).join('');
  return xlsx({
    sharedStrings: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="${NS}" count="${count}" uniqueCount="${count}">${si}</sst>`,
    sheetXml: sheet('<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>' + (count - 1) + '</v></c></row>'),
  });
}

/** One shared string of `chars` characters, far above Excel's 32,767-character cell limit. */
export function hugeSharedString(chars: number): Promise<Uint8Array> {
  return xlsx({
    sharedStrings: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="${NS}" count="1" uniqueCount="1"><si><t>${'x'.repeat(chars)}</t></si></sst>`,
    sheetXml: sheet('<row r="1"><c r="A1" t="s"><v>0</v></c></row>'),
  });
}

/** XML nested `depth` levels deep inside a cell's inline string. */
export function deepXml(depth: number): Promise<Uint8Array> {
  return xlsx({ sheetXml: sheet(`<row r="1"><c r="A1" t="inlineStr"><is>${'<r>'.repeat(depth)}${'</r>'.repeat(depth)}<t>deep</t></is></c></row>`) });
}

/** A DOCTYPE with an external entity (XXE) in the sheet. */
export function xxe(): Promise<Uint8Array> {
  const x = sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>&xxe;</t></is></c></row>');
  return xlsx({ sheetXml: x.replace('<worksheet', '<!DOCTYPE worksheet [<!ENTITY xxe SYSTEM "https://attacker.example/x">]><worksheet') });
}

/** "Billion laughs": nested internal entities. */
export function billionLaughs(): Promise<Uint8Array> {
  const ents = ['<!ENTITY a "lol">', ...Array.from({ length: 9 }, (_, i) => `<!ENTITY ${String.fromCharCode(98 + i)} "${`&${String.fromCharCode(97 + i)};`.repeat(10)}">`)].join('');
  const x = sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>&j;</t></is></c></row>');
  return xlsx({ sheetXml: x.replace('<worksheet', `<!DOCTYPE worksheet [${ents}]><worksheet`) });
}

/** A sheet whose XML stops in the middle of an element. */
export function malformedXml(): Promise<Uint8Array> {
  return xlsx({ sheetXml: sheet('<row r="1"><c r="A1"><v>1</v></c></row>').slice(0, -40) });
}

export function badCrc(): Promise<Uint8Array> {
  return xlsx({ entry: { 'xl/worksheets/sheet1.xml': { badCrc: true } } });
}

export function encryptedEntry(): Promise<Uint8Array> {
  return xlsx({ entry: { 'xl/worksheets/sheet1.xml': { encrypted: true } } });
}

/** Compression method 14 (LZMA), which the reader doesn't support. */
export function unsupportedMethod(): Promise<Uint8Array> {
  return xlsx({ entry: { 'xl/worksheets/sheet1.xml': { method: 14 } } });
}

/** A valid zip that isn't a workbook (no workbook part). */
export function zipWithoutWorkbook(): Promise<Uint8Array> {
  return zip([{ name: 'readme.txt', data: 'not a workbook' }]);
}

/** The first half of a valid workbook. */
export async function truncated(): Promise<Uint8Array> {
  const full = await xlsx();
  return full.subarray(0, Math.floor(full.length / 2));
}

/** The compound-file signature of a legacy .xls (or an encrypted .xlsx). */
export function cfb(): Uint8Array {
  const b = new Uint8Array(1024);
  b.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  return b;
}

/** Hyperlinks with hostile targets, as external relationships, plus a look-alike display text. */
export const HOSTILE_TARGETS = [
  'javascript:alert(document.domain)',
  'JaVaScRiPt:alert(1)',
  ' \tjavascript:alert(1)',
  'java\nscript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  'file:///etc/passwd',
  '\\\\attacker.example\\share\\x.xlsx',
] as const;

export function hostileLinks(): Promise<Uint8Array> {
  const rows = HOSTILE_TARGETS.map((_, i) => `<row r="${i + 1}">${inlineStr(`A${i + 1}`, `Click me ${i + 1}`)}</row>`).join('');
  const lookAlike = `<row r="${HOSTILE_TARGETS.length + 1}">${inlineStr(`A${HOSTILE_TARGETS.length + 1}`, 'https://bank.example/login')}</row>`;
  const links = [...HOSTILE_TARGETS.map((_, i) => `<hyperlink ref="A${i + 1}" r:id="rId${i + 1}"/>`), `<hyperlink ref="A${HOSTILE_TARGETS.length + 1}" r:id="rId${HOSTILE_TARGETS.length + 1}"/>`].join('');
  return xlsx({
    sheetXml: sheet(rows + lookAlike, `<hyperlinks>${links}</hyperlinks>`),
    sheetRels: rels([
      ...HOSTILE_TARGETS.map((t, i) => ({ id: `rId${i + 1}`, type: 'hyperlink', target: t, external: true })),
      { id: `rId${HOSTILE_TARGETS.length + 1}`, type: 'hyperlink', target: 'https://attacker.example/phish', external: true },
    ]),
  });
}

/**
 * Parts that point outside the file: an external workbook link with a formula that uses it, a drawing with
 * a remote image, and a remote data connection. The viewer must show the cached values and fetch nothing.
 */
export function externalTargets(): Promise<Uint8Array> {
  return xlsx({
    sheetXml: sheet(`<row r="1"><c r="A1"><f>[1]Sheet1!A1*2</f><v>84</v></c>${inlineStr('B1', 'external')}</row>`, '<drawing r:id="rId1"/>'),
    sheetRels: rels([{ id: 'rId1', type: 'drawing', target: '../drawings/drawing1.xml' }]),
    workbookExtra: '<externalReferences><externalReference r:id="rId10"/></externalReferences>',
    workbookRelsExtra: `<Relationship Id="rId10" Type="${R}/externalLink" Target="externalLinks/externalLink1.xml"/><Relationship Id="rId11" Type="${R}/connections" Target="connections.xml"/>`,
    contentTypesExtra:
      '<Override PartName="/xl/externalLinks/externalLink1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.externalLink+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/connections.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml"/>',
    extra: [
      { name: 'xl/externalLinks/externalLink1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><externalLink xmlns="${NS}" xmlns:r="${R}"><externalBook r:id="rId1"><sheetNames><sheetName val="Sheet1"/></sheetNames></externalBook></externalLink>` },
      { name: 'xl/externalLinks/_rels/externalLink1.xml.rels', data: rels([{ id: 'rId1', type: 'externalLinkPath', target: 'https://attacker.example/book.xlsx', external: true }]) },
      {
        name: 'xl/drawings/drawing1.xml',
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${R}"><xdr:oneCellAnchor><xdr:from><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="952500" cy="952500"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Picture 1"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:link="rId1"/></xdr:blipFill><xdr:spPr/></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`,
      },
      { name: 'xl/drawings/_rels/drawing1.xml.rels', data: rels([{ id: 'rId1', type: 'image', target: 'https://tracker.example/pixel.png', external: true }]) },
      { name: 'xl/connections.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><connections xmlns="${NS}"><connection id="1" name="web" type="4" refreshOnLoad="1"><webPr url="https://attacker.example/data"/></connection></connections>` },
    ],
  });
}

/** Script-like text in a cell, the sheet name and a number-format literal, with the styles to use it. */
export const SCRIPTY = '<img src=x onerror="window.__xlvPwned=1"><script>window.__xlvPwned=1</script>';
export function scriptLikeContent(): Promise<Uint8Array> {
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS}"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;${xmlEscape('<img src=x onerror=window.__xlvPwned=1>')}&quot;0"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><sz val="11"/><name val="${xmlEscape("x'; } body { background: url(https://tracker.example/f.png) } .a{ font-family: 'y")}"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/></cellXfs></styleSheet>`;
  return xlsx({
    sheetName: '<b>x</b>',
    styles,
    sheetXml: sheet(`<row r="1">${inlineStr('A1', SCRIPTY)}<c r="B1" s="1"><v>5</v></c>${inlineStr('C1', 'font', 2)}</row>`, '', '<cols><col min="2" max="2" width="60" customWidth="1"/></cols>'),
  });
}

/** One merge over the whole sheet (A1:XFD1048576) plus `count` small merges. */
export function hugeMerges(count: number): Promise<Uint8Array> {
  const merges = ['A1:XFD1048576', ...Array.from({ length: count }, (_, i) => `A${i * 2 + 3}:B${i * 2 + 3}`)];
  return xlsx({ sheetXml: sheet(`<row r="1">${inlineStr('A1', 'everything')}</row>`, `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`) });
}

/** `count` distinct cell formats (fonts, fills, borders), each used by one cell. */
export function manyStyles(count: number): Promise<Uint8Array> {
  const fonts = Array.from({ length: count }, (_, i) => `<font><sz val="${8 + (i % 20)}"/><color rgb="FF${(i * 2654435761 >>> 8).toString(16).padStart(6, '0').slice(-6)}"/><name val="Font ${i}"/></font>`).join('');
  const xfs = Array.from({ length: count }, (_, i) => `<xf numFmtId="0" fontId="${i + 1}" fillId="0" borderId="0" applyFont="1"/>`).join('');
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS}"><fonts count="${count + 1}"><font><sz val="11"/><name val="Calibri"/></font>${fonts}</fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${count + 1}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>${xfs}</cellXfs></styleSheet>`;
  const rows = Array.from({ length: Math.ceil(count / 10) }, (_, r) => `<row r="${r + 1}">${Array.from({ length: 10 }, (_, c) => `<c r="${String.fromCharCode(65 + c)}${r + 1}" s="${r * 10 + c + 1}"><v>${r * 10 + c}</v></c>`).join('')}</row>`).join('');
  return xlsx({ styles, sheetXml: sheet(rows) });
}
