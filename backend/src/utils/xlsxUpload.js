import ExcelJS from 'exceljs';
import Driver from '../models/Driver.js';
import DriverRosterSnapshot from '../models/DriverRosterSnapshot.js';

// Percentage drop in row count that triggers a safety warning instead of proceeding
const STRICT_REPLACE_DROP_THRESHOLD = 0.30;

/**
 * Parse an xlsx/xls buffer and bulk-upsert drivers.
 * Supports either header-based mapping or positional fallback.
 * Fallback columns (header row optional):
 *   Col 1: Driver Number (required)
 *   Col 2: Driver Name   (required)
 *   Col 3: Regional Service Provider (optional)
 *   Col 4: Status (optional: active|inactive)
 *
 * Returns: { total, inserted, updated, skipped, errors }
 */

const getCellText = (cell) => {
  const value = cell?.value;
  if (value == null) return '';

  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text.trim();
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part?.text || '').join('').trim();
    }
    if (value.result != null) return String(value.result).trim();
    if (typeof value.hyperlink === 'string') return value.hyperlink.trim();
  }

  return String(value).trim();
};

const normalizeHeader = (text) =>
  text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9# ]/g, '')
    .trim();

const parseStatus = (rawStatus) => {
  if (!rawStatus) return null;

  const normalized = rawStatus.toLowerCase().trim();
  if (['active', 'a', '1', 'yes', 'y', 'true'].includes(normalized)) return 'active';
  if (['inactive', 'in active', 'i', '0', 'no', 'n', 'false'].includes(normalized)) return 'inactive';

  return 'invalid';
};

const getHeaderMap = (headerRow) => {
  const headerMap = {};

  for (let col = 1; col <= headerRow.cellCount; col++) {
    const header = normalizeHeader(getCellText(headerRow.getCell(col)));

    if (['driver #', 'driver#', 'driver number', 'drivernumber', 'driver id', 'driverid'].includes(header)) {
      headerMap.driverNumber = col;
      continue;
    }
    if (['name', 'driver name', 'drivername'].includes(header)) {
      headerMap.name = col;
      continue;
    }
    if (['provider', 'rsp', 'regional service provider', 'regionalserviceprovider'].includes(header)) {
      headerMap.rsp = col;
      continue;
    }
    if (['status', 'driver status', 'driverstatus', 'activeinactive'].includes(header)) {
      headerMap.status = col;
    }
  }

  return headerMap;
};

/**
 * Parse the raw worksheet rows into validated driver records.
 * Returns { rows: [], errors: [], total } where rows are ready to upsert.
 */
const parseWorksheet = (worksheet) => {
  const headerMap = getHeaderMap(worksheet.getRow(1));
  const hasHeaderRow = Boolean(headerMap.driverNumber && headerMap.name);

  const driverNumberCol = headerMap.driverNumber || 1;
  const nameCol         = headerMap.name         || 2;
  const rspCol          = headerMap.rsp          || 3;
  const statusCol       = headerMap.status       || 4;

  const rows   = [];
  const errors = [];
  let total    = 0;

  worksheet.eachRow((row, rowNumber) => {
    if (hasHeaderRow && rowNumber === 1) return;

    const rawNumber = getCellText(row.getCell(driverNumberCol));
    const rawName   = getCellText(row.getCell(nameCol));
    const rawRsp    = getCellText(row.getCell(rspCol));
    const rawStatus = getCellText(row.getCell(statusCol));

    const driverNumber = rawNumber ? rawNumber.toUpperCase() : '';
    const name         = rawName;
    const rsp          = rawRsp;
    const parsedStatus = parseStatus(rawStatus);

    if (!driverNumber && !name && !rsp && !rawStatus) return; // blank row

    total++;

    if (!driverNumber) {
      errors.push({ row: rowNumber, error: 'Driver number is required' });
      return;
    }
    if (!name) {
      errors.push({ row: rowNumber, driverNumber, error: 'Driver name is required' });
      return;
    }
    if (driverNumber.length > 50) {
      errors.push({ row: rowNumber, driverNumber, error: 'Driver number too long (max 50 chars)' });
      return;
    }
    if (parsedStatus === 'invalid') {
      errors.push({ row: rowNumber, driverNumber, error: `Invalid status value "${rawStatus}"` });
      return;
    }

    rows.push({ driverNumber, name, rsp, status: parsedStatus });
  });

  return { rows, errors, total };
};

/**
 * processDriverUpload — upsert drivers from an xlsx buffer.
 *
 * Options:
 *   strictReplace {boolean} — when true, drivers absent from this file are
 *                             auto-marked inactive (daily roster mode).
 *   confirmDrop   {boolean} — must be true to proceed when >30% row drop
 *                             would occur in strictReplace mode. If false
 *                             the function returns { needsConfirmation: true }.
 *   filename      {string}  — original filename for snapshot record.
 *
 * Returns: { total, inserted, updated, autoInactivated, skipped, errors,
 *            needsConfirmation?, previousTotal?, newTotal? }
 */
export const processDriverUpload = async (
  fileBuffer,
  uploadedBy,
  { strictReplace = false, confirmDrop = false, filename = '' } = {}
) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('No worksheet found in the uploaded file.');

  const { rows, errors, total } = parseWorksheet(worksheet);
  const skipped = errors.length;

  const results = {
    total,
    inserted: 0,
    updated: 0,
    autoInactivated: 0,
    skipped,
    errors,
    mode: strictReplace ? 'strict_replace' : 'additive',
  };

  if (rows.length === 0) return results;

  const uploadBatch = new Date().toISOString().split('T')[0];
  const uploadedDriverNumbers = new Set(rows.map((r) => r.driverNumber));

  // ── Safety check for strict replace ────────────────────────────────────────
  if (strictReplace && !confirmDrop) {
    const previousTotal = await Driver.countDocuments({ status: 'active' });
    const dropCount = previousTotal - uploadedDriverNumbers.size;
    const dropRatio = previousTotal > 0 ? dropCount / previousTotal : 0;

    if (dropRatio > STRICT_REPLACE_DROP_THRESHOLD && dropCount > 0) {
      return {
        ...results,
        needsConfirmation: true,
        previousTotal,
        newTotal: uploadedDriverNumbers.size,
        dropCount,
        dropPercent: Math.round(dropRatio * 100),
      };
    }
  }

  // ── Upsert all parsed rows ─────────────────────────────────────────────────
  const operations = rows.map(({ driverNumber, name, rsp, status }) => {
    const updateSet = {
      name,
      regionalServiceProvider: rsp,
      uploadedBy,
      uploadBatch,
      lastSeenBatchDate: uploadBatch,
    };
    if (status) updateSet.status = status;
    if (status === 'active') updateSet.deactivatedReason = null;

    return {
      updateOne: {
        filter: { driverNumber },
        update: { $set: updateSet },
        upsert: true,
      },
    };
  });

  const bulkResult = await Driver.bulkWrite(operations, { ordered: false });
  results.inserted = bulkResult.upsertedCount  || bulkResult.nUpserted  || 0;
  results.updated  = bulkResult.modifiedCount  || bulkResult.nModified  || 0;

  // ── Strict replace: mark missing active drivers inactive ───────────────────
  if (strictReplace) {
    const reconcileResult = await Driver.updateMany(
      {
        driverNumber: { $nin: Array.from(uploadedDriverNumbers) },
        status: 'active',
      },
      {
        $set: {
          status: 'inactive',
          deactivatedReason: 'missing_from_upload',
          uploadBatch,
        },
      }
    );
    results.autoInactivated = reconcileResult.modifiedCount || reconcileResult.nModified || 0;
  }

  // ── Persist roster snapshot ────────────────────────────────────────────────
  await DriverRosterSnapshot.create({
    uploadDate:  new Date(),
    batchId:     uploadBatch,
    uploadedBy,
    filename,
    mode:        results.mode,
    stats: {
      total,
      inserted:        results.inserted,
      updated:         results.updated,
      autoInactivated: results.autoInactivated,
      skipped,
      errors:          errors.length,
    },
    driverSnapshot: rows.map(({ driverNumber, name, rsp, status }) => ({
      driverNumber,
      name,
      rsp,
      status: status || 'active',
    })),
    rowErrors: errors,
  });

  return results;
};
