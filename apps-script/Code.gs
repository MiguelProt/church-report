const SETTINGS = {
  REPORTS_SHEET: 'Reportes',
  MATTERS_SHEET: 'Asuntos',
  PRINT_SHEET: 'Plantilla',
  GENERATE_PDF_ON_SAVE: false
};

function doGet(event) {
  const action = event && event.parameter ? event.parameter.action : '';
  if (action === 'status') return statusResponse_(event.parameter);
  return jsonResponse_({ ok: true, service: 'Bitácora API', version: 2 });
}

function doPost(event) {
  let requestId = '';
  try {
    const payload = JSON.parse(event.postData.contents || '{}');
    requestId = normalizeRequestId_(payload.requestId);
    if (payload.action !== 'saveReport') throw new Error('Acción no reconocida.');
    const previousStatus = readStatus_(requestId);
    if (previousStatus && previousStatus.status === 'success') {
      return jsonResponse_({ ok: true, reportId: previousStatus.reportId, duplicate: true });
    }
    writeStatus_(requestId, { status: 'processing' });
    validatePayload_(payload);
    const result = saveReport_(payload);
    writeStatus_(requestId, { status: 'success', reportId: result.reportId, pdfUrl: result.pdfUrl || '' });
    return jsonResponse_({ ok: true, ...result });
  } catch (error) {
    console.error(error);
    if (requestId) writeStatus_(requestId, { status: 'error', error: safeErrorMessage_(error) });
    return jsonResponse_({ ok: false, error: error.message });
  }
}

function normalizeRequestId_(value) {
  const requestId = String(value || '');
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) throw new Error('El identificador de la solicitud no es válido.');
  return requestId;
}

function statusCacheKey_(requestId) {
  return `report-status-${requestId}`;
}

function writeStatus_(requestId, status) {
  CacheService.getScriptCache().put(statusCacheKey_(requestId), JSON.stringify(status), 21600);
}

function readStatus_(requestId) {
  const value = CacheService.getScriptCache().get(statusCacheKey_(requestId));
  return value ? JSON.parse(value) : null;
}

function statusResponse_(parameters) {
  try {
    const requestId = normalizeRequestId_(parameters.requestId);
    const callback = String(parameters.callback || '');
    if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,100}$/.test(callback)) throw new Error('Callback no válido.');
    const status = readStatus_(requestId) || { status: 'pending' };
    return ContentService
      .createTextOutput(`${callback}(${JSON.stringify(status)});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  } catch (error) {
    return jsonResponse_({ ok: false, error: safeErrorMessage_(error) });
  }
}

function safeErrorMessage_(error) {
  const message = String(error && error.message ? error.message : 'No se pudo guardar el reporte.');
  return message.slice(0, 300);
}

function setupSpreadsheet() {
  const spreadsheet = getSpreadsheet_();
  ensureSheet_(spreadsheet, SETTINGS.REPORTS_SHEET, [
    'ID reporte', 'Fecha de captura', 'Organización', 'Nombre del líder', 'Fecha del reporte', 'Cantidad de asuntos'
  ]);
  ensureSheet_(spreadsheet, SETTINGS.MATTERS_SHEET, [
    'ID reporte', 'Número', 'Persona/Asunto', 'Problemas o desafíos', 'Qué se ha hecho',
    'Resultados observados', 'Recursos necesarios', 'Quién puede ayudar', 'Notas adicionales'
  ]);
  ensurePrintSheet_(spreadsheet);
}

function saveReport_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    setupSpreadsheet();
    const spreadsheet = getSpreadsheet_();
    const reportId = Utilities.getUuid().split('-')[0].toUpperCase();
    spreadsheet.getSheetByName(SETTINGS.REPORTS_SHEET).appendRow([
      reportId, new Date(), safeCell_(payload.organization), safeCell_(payload.leader), payload.reportDate, payload.matters.length
    ]);
    const rows = payload.matters.map((matter, index) => [
      reportId, index + 1, safeCell_(matter.subject), safeCell_(matter.challenges), safeCell_(matter.actions),
      safeCell_(matter.results), safeCell_(matter.resources), safeCell_(matter.helpers), safeCell_(matter.notes)
    ]);
    const matterSheet = spreadsheet.getSheetByName(SETTINGS.MATTERS_SHEET);
    matterSheet.getRange(matterSheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    renderPrintSheet_(spreadsheet, reportId, payload);
    SpreadsheetApp.flush();
    const pdfUrl = SETTINGS.GENERATE_PDF_ON_SAVE ? generatePdf_(spreadsheet, reportId) : '';
    return { reportId, pdfUrl };
  } finally {
    lock.releaseLock();
  }
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(getRequiredProperty_('SPREADSHEET_ID'));
}

function getRequiredProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error(`Falta configurar la propiedad del script: ${name}.`);
  return value;
}

function validatePayload_(payload) {
  if (!payload.organization || !payload.leader || !payload.reportDate) throw new Error('Faltan datos generales obligatorios.');
  if (!Array.isArray(payload.matters) || !payload.matters.length) throw new Error('Agrega al menos un asunto.');
  if (payload.matters.length > 50) throw new Error('El máximo es de 50 asuntos por reporte.');
  payload.matters.forEach((matter, index) => {
    if (!matter.subject) throw new Error(`Falta Persona/Asunto en la ficha ${index + 1}.`);
  });
}

function safeCell_(value) {
  const text = String(value || '').slice(0, 10000);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function ensureSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#123c35').setFontColor('#ffffff').setFontWeight('bold');
    sheet.autoResizeColumns(1, headers.length);
  }
  return sheet;
}

function ensurePrintSheet_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(SETTINGS.PRINT_SHEET) || spreadsheet.insertSheet(SETTINGS.PRINT_SHEET);
  sheet.setHiddenGridlines(true);
  return sheet;
}

function renderPrintSheet_(spreadsheet, reportId, payload) {
  const sheet = spreadsheet.getSheetByName(SETTINGS.PRINT_SHEET);
  sheet.clear();
  sheet.getRange('A1:G1').merge().setValue('REPORTE DE SEGUIMIENTO').setFontSize(18).setFontWeight('bold').setFontColor('#ffffff').setBackground('#123c35').setHorizontalAlignment('center');
  sheet.getRange('A3:B3').setValues([['Organización', safeCell_(payload.organization)]]);
  sheet.getRange('D3:E3').setValues([['Nombre del líder', safeCell_(payload.leader)]]);
  sheet.getRange('F3:G3').setValues([['Fecha', payload.reportDate]]);
  sheet.getRange('A4:G4').merge().setValue(`ID: ${reportId}`).setFontColor('#65716c');
  let row = 6;
  payload.matters.forEach((matter, index) => {
    sheet.getRange(row, 1, 1, 7).merge().setValue(`ASUNTO ${index + 1} · ${safeCell_(matter.subject)}`).setFontWeight('bold').setFontColor('#ffffff').setBackground('#1f5b50');
    row += 1;
    const labels = ['Problemas o desafíos', 'Qué se ha hecho', 'Resultados observados', 'Recursos necesarios', 'Quién puede ayudar', 'Notas adicionales'];
    const values = [matter.challenges, matter.actions, matter.results, matter.resources, matter.helpers, matter.notes];
    labels.forEach((label, i) => {
      sheet.getRange(row, 1, 1, 2).merge().setValue(label).setFontWeight('bold').setBackground('#e7eddf');
      sheet.getRange(row, 3, 1, 5).merge().setValue(safeCell_(values[i])).setWrap(true).setVerticalAlignment('top');
      sheet.setRowHeight(row, 46);
      row += 1;
    });
    row += 1;
  });
  sheet.setColumnWidths(1, 7, 110);
  sheet.getRange(1, 1, Math.max(row - 1, 1), 7).setFontFamily('Arial').setBorder(true, true, true, true, true, true, '#d9ded4', SpreadsheetApp.BorderStyle.SOLID);
}

function generatePdf_(spreadsheet, reportId) {
  const pdfFolderId = getRequiredProperty_('PDF_FOLDER_ID');
  const sheet = spreadsheet.getSheetByName(SETTINGS.PRINT_SHEET);
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheet.getId()}/export?format=pdf&gid=${sheet.getSheetId()}&size=letter&portrait=true&fitw=true&sheetnames=false&printtitle=false&pagenumbers=true&gridlines=false&fzr=false`;
  const response = UrlFetchApp.fetch(url, { headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` } });
  const file = DriveApp.getFolderById(pdfFolderId).createFile(response.getBlob().setName(`Reporte-${reportId}.pdf`));
  return file.getUrl();
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
