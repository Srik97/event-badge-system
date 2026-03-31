// src/services/badgeService.js
const puppeteer = require('puppeteer');
const { PDFDocument } = require('pdf-lib');
const fs   = require('fs');
const path = require('path');

const TEMPLATE_PATH  = path.join(__dirname, '../templates/badge.html');
const EXPORTS_DIR    = path.join(__dirname, '../../exports');
const INDIVIDUAL_DIR = path.join(EXPORTS_DIR, 'individual');
const BULK_DIR       = path.join(EXPORTS_DIR, 'bulk');

// Ensure dirs exist
[EXPORTS_DIR, INDIVIDUAL_DIR, BULK_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// Color map per participant type
const TYPE_COLORS = {
  'delegate':   { color: '#1a5fa8', light: '#e8f0fb', dark: '#0d3d6e' },
  'faculty':    { color: '#1a8a4a', light: '#e6f5ec', dark: '#0d5c2e' },
  'sponsor':    { color: '#7b3fa8', light: '#f3eafb', dark: '#52297a' },
  'stall':      { color: '#c47a1a', light: '#fdf3e3', dark: '#8a5610' },
  'av':         { color: '#1a8a8a', light: '#e6f7f7', dark: '#0d5c5c' },
  'event team': { color: '#c41a3a', light: '#fde8ec', dark: '#8a1025' },
};
const DEFAULT_COLOR = { color: '#555555', light: '#f0f0f0', dark: '#333333' };

function getTypeColor(type) {
  return TYPE_COLORS[(type || '').toLowerCase()] || DEFAULT_COLOR;
}

function buildBadgeHTML(template, participant, settings) {
  const tc = getTypeColor(participant.type);

  // Logo HTML — real image or event name text
  let logoHtml = '';
  if (settings.logo_path && fs.existsSync(settings.logo_path)) {
    const logoData = fs.readFileSync(settings.logo_path);
    const ext = path.extname(settings.logo_path).slice(1).toLowerCase();
    const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    logoHtml = `<img src="data:${mime};base64,${logoData.toString('base64')}" alt="logo">`;
  } else {
    logoHtml = `<div class="logo-placeholder">${settings.event_name || 'Event Name'}</div>`;
  }

  // Company line (only if present)
  const companyHtml = participant.company
    ? `<div class="company">${participant.company}</div>`
    : '';

  // Background Data URL logic
  let bgHtml = '';
  let bodyClass = '';
  if (settings.badge_bg_path && fs.existsSync(settings.badge_bg_path)) {
    const bgData = fs.readFileSync(settings.badge_bg_path);
    const bgUrl  = `data:image/png;base64,${bgData.toString('base64')}`;
    bgHtml    = `<img src="${bgUrl}" class="custom-bg" alt="background">`;
    bodyClass = 'has-custom-bg';
  }

  const pType = String(participant.type || 'Delegate').trim();
  const replacements = {
    '{{TYPE_COLOR}}':        tc.color,
    '{{TYPE_COLOR_LIGHT}}':  tc.light,
    '{{TYPE_COLOR_DARK}}':   tc.dark,
    '{{LOGO_HTML}}':         logoHtml,
    '{{EVENT_NAME}}':        settings.event_name || 'Event Name',
    '{{EVENT_DATE}}':        settings.event_date || '',
    '{{PARTICIPANT_TYPE}}':  pType.toUpperCase(),
    '{{TYPE}}':              pType.toUpperCase(),
    '{{PARTICIPANT_NAME}}':  participant.name || '',
    '{{COMPANY_HTML}}':      companyHtml,
    '{{QR_DATA_URL}}':       participant.qr_base64 || '',
    '{{BADGE_ID}}':          participant.badge_id || '',
    '{{BG_HTML}}':           bgHtml,
    '{{BODY_CLASS}}':        bodyClass
  };

  let html = template;
  for (const [key, val] of Object.entries(replacements)) {
    const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    html = html.replace(regex, val);
  }

  return html;
}

async function renderBadgeToPDF(browser, html) {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    // A6 at 96dpi: 397×561px
    const pdfBuffer = await page.pdf({
      width:  '105mm',
      height: '148mm',
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 }
    });
    return pdfBuffer;
  } finally {
    await page.close();
  }
}

/**
 * Generate badges for given participant IDs (or all if empty)
 * Returns { individualFiles, bulkPath, count }
 */
async function generateBadges(participants, settings, onProgress) {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  // Clean old individual exports
  fs.readdirSync(INDIVIDUAL_DIR).forEach(f => {
    if (f.endsWith('.pdf')) fs.unlinkSync(path.join(INDIVIDUAL_DIR, f));
  });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const individualFiles = [];
  const pdfBuffers = [];

  try {
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      if (onProgress) onProgress(i + 1, participants.length, p.name);

      const html = buildBadgeHTML(template, p, settings);
      const pdfBuf = await renderBadgeToPDF(browser, html);

      // Save individual file
      const safeName = p.name.replace(/[^a-z0-9]/gi, '_').substring(0, 40);
      const filename  = `${p.badge_id}_${safeName}.pdf`;
      const filePath  = path.join(INDIVIDUAL_DIR, filename);
      fs.writeFileSync(filePath, pdfBuf);
      individualFiles.push({ filename, path: filePath, badge_id: p.badge_id, name: p.name });

      pdfBuffers.push(pdfBuf);
    }
  } finally {
    await browser.close();
  }

  // Merge into bulk PDF using pdf-lib
  const bulkDoc = await PDFDocument.create();
  for (const buf of pdfBuffers) {
    const srcDoc = await PDFDocument.load(buf);
    const [page] = await bulkDoc.copyPages(srcDoc, [0]);
    bulkDoc.addPage(page);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const bulkFilename = `badges_bulk_${timestamp}.pdf`;
  const bulkPath     = path.join(BULK_DIR, bulkFilename);
  fs.writeFileSync(bulkPath, await bulkDoc.save());

  return {
    count: participants.length,
    individualFiles,
    bulkPath,
    bulkFilename
  };
}

module.exports = { generateBadges, getTypeColor, TYPE_COLORS };
