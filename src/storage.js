require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { sql, initDB } = require('./db');

function getOffsetDate(dateStr, dayOffset) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().split('T')[0];
}

function getPreviousDate(dateStr) {
  return getOffsetDate(dateStr, -1);
}

function mapRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    dataRegistro: r.data_registro,
    maq: r.maq || '',
    mat: r.mat || '',
    tipoMat: r.tipo_mat || 'Melhorada',
    diam: r.diam || '',
    loc: r.loc || '',
    obs: r.obs || '',
    tirada: Boolean(r.tirada),
    encostada: Boolean(r.encostada),
    carregada: Boolean(r.carregada),
    origemId: r.origem_id || null,
    origemData: r.origem_data || null,
    transferido: Boolean(r.transferido),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

/**
 * Obtém todas as datas com registros no Neon
 */
async function getAllDates() {
  await initDB();
  const rows = await sql`
    SELECT DISTINCT data_registro FROM records ORDER BY data_registro ASC
  `;
  return rows.map(r => r.data_registro);
}

/**
 * Obtém os registros de um dia e executa a transição de pendências do dia anterior
 */
async function getDayRecords(dateStr, performRollover = true) {
  await initDB();

  if (performRollover) {
    await applyAutoRollover(dateStr);
  }

  const rows = await sql`
    SELECT * FROM records 
    WHERE data_registro = ${dateStr} 
    ORDER BY created_at ASC
  `;

  const allDates = await getAllDates();

  return {
    date: dateStr,
    records: rows.map(mapRow),
    allDates
  };
}

/**
 * Transição automática de máquinas não carregadas para o dia alvo
 */
async function applyAutoRollover(targetDate) {
  const prevDate = getPreviousDate(targetDate);

  // Busca máquinas não carregadas do dia anterior
  const pendingRows = await sql`
    SELECT * FROM records 
    WHERE data_registro = ${prevDate} AND carregada = FALSE
  `;

  if (pendingRows.length === 0) return false;

  // Busca registros do dia atual para evitar duplicatas
  const currentRows = await sql`
    SELECT * FROM records 
    WHERE data_registro = ${targetDate}
  `;

  let added = 0;

  for (const pending of pendingRows) {
    const alreadyExists = currentRows.some(r => 
      (r.origem_id && r.origem_id === pending.id) ||
      (r.origem_data === prevDate && r.maq === pending.maq)
    );

    if (!alreadyExists) {
      await sql`
        INSERT INTO records (
          data_registro, maq, mat, tipo_mat, diam, loc, obs, 
          tirada, encostada, carregada, origem_id, origem_data, transferido
        ) VALUES (
          ${targetDate}, ${pending.maq}, ${pending.mat}, ${pending.tipo_mat || 'Melhorada'},
          ${pending.diam}, ${pending.loc}, ${pending.obs},
          ${Boolean(pending.tirada)}, ${Boolean(pending.encostada)}, FALSE,
          ${pending.id}, ${prevDate}, TRUE
        )
      `;
      added++;
    }
  }

  return added > 0;
}

/**
 * Transfere manualmente pendências de uma data de origem para destino
 */
async function manualRollover(sourceDate, targetDate) {
  await initDB();

  const pendingRows = await sql`
    SELECT * FROM records 
    WHERE data_registro = ${sourceDate} AND carregada = FALSE
  `;

  const currentRows = await sql`
    SELECT * FROM records 
    WHERE data_registro = ${targetDate}
  `;

  let count = 0;

  for (const item of pendingRows) {
    const exists = currentRows.some(r => 
      (r.origem_id && r.origem_id === item.id) || 
      (r.maq === item.maq && r.origem_data === sourceDate)
    );

    if (!exists) {
      await sql`
        INSERT INTO records (
          data_registro, maq, mat, tipo_mat, diam, loc, obs, 
          tirada, encostada, carregada, origem_id, origem_data, transferido
        ) VALUES (
          ${targetDate}, ${item.maq}, ${item.mat}, ${item.tipo_mat || 'Melhorada'},
          ${item.diam}, ${item.loc}, ${item.obs},
          ${Boolean(item.tirada)}, ${Boolean(item.encostada)}, FALSE,
          ${item.id}, ${sourceDate}, TRUE
        )
      `;
      count++;
    }
  }

  const updatedRows = await sql`
    SELECT * FROM records WHERE data_registro = ${targetDate} ORDER BY created_at ASC
  `;

  return { success: true, transferred: count, targetRecords: updatedRows.map(mapRow) };
}

/**
 * Adiciona um novo registro no banco Neon
 */
async function addRecord(dateStr, data) {
  await initDB();

  const rows = await sql`
    INSERT INTO records (
      data_registro, maq, mat, tipo_mat, diam, loc, obs,
      tirada, encostada, carregada, origem_id, origem_data, transferido
    ) VALUES (
      ${dateStr}, ${(data.maq || '').trim()}, ${(data.mat || '').trim()},
      ${(data.tipoMat || 'Melhorada').trim()}, ${(data.diam || '').trim()},
      ${(data.loc || '').trim()}, ${(data.obs || '').trim()},
      ${Boolean(data.tirada)}, ${Boolean(data.encostada)}, ${Boolean(data.carregada)},
      ${data.origemId || null}, ${data.origemData || null}, ${Boolean(data.transferido)}
    )
    RETURNING *
  `;

  return mapRow(rows[0]);
}

/**
 * Atualiza um registro existente no banco Neon
 */
async function updateRecord(dateStr, id, updates) {
  await initDB();

  // Busca o registro atual
  const existing = await sql`
    SELECT * FROM records WHERE id = ${id}
  `;

  if (existing.length === 0) {
    throw new Error('Registro não encontrado no banco de dados');
  }

  const current = existing[0];

  const maq = updates.maq !== undefined ? updates.maq.trim() : current.maq;
  const mat = updates.mat !== undefined ? updates.mat.trim() : current.mat;
  const tipoMat = updates.tipoMat !== undefined ? updates.tipoMat.trim() : current.tipo_mat;
  const diam = updates.diam !== undefined ? updates.diam.trim() : current.diam;
  const loc = updates.loc !== undefined ? updates.loc.trim() : current.loc;
  const obs = updates.obs !== undefined ? updates.obs.trim() : current.obs;
  const tirada = updates.tirada !== undefined ? Boolean(updates.tirada) : current.tirada;
  const encostada = updates.encostada !== undefined ? Boolean(updates.encostada) : current.encostada;
  const carregada = updates.carregada !== undefined ? Boolean(updates.carregada) : current.carregada;

  const rows = await sql`
    UPDATE records 
    SET 
      maq = ${maq},
      mat = ${mat},
      tipo_mat = ${tipoMat},
      diam = ${diam},
      loc = ${loc},
      obs = ${obs},
      tirada = ${tirada},
      encostada = ${encostada},
      carregada = ${carregada},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;

  return mapRow(rows[0]);
}

/**
 * Remove um registro
 */
async function deleteRecord(dateStr, id) {
  await initDB();

  const rows = await sql`
    DELETE FROM records WHERE id = ${id} RETURNING id
  `;

  if (rows.length === 0) {
    throw new Error('Registro não encontrado para exclusão');
  }

  return { success: true, id };
}

/**
 * Obtém resumo estatístico de uma data
 */
async function getSummary(dateStr) {
  await initDB();

  const rows = await sql`
    SELECT * FROM records WHERE data_registro = ${dateStr}
  `;

  const total = rows.length;
  const tiradas = rows.filter(r => r.tirada).length;
  const encostadas = rows.filter(r => r.encostada).length;
  const carregadas = rows.filter(r => r.carregada).length;
  const pendentes = total - carregadas;
  const porcentagem = total > 0 ? Math.round((carregadas / total) * 100) : 0;

  const prevDate = getPreviousDate(dateStr);
  const prevRows = await sql`
    SELECT * FROM records WHERE data_registro = ${prevDate} AND carregada = FALSE
  `;

  return {
    date: dateStr,
    total,
    tiradas,
    encostadas,
    carregadas,
    pendentes,
    porcentagem,
    prevDate,
    prevPendentes: prevRows.length
  };
}

/**
 * Exporta todo o banco em formato estruturado (JSON)
 */
async function exportFullDB() {
  await initDB();
  const rows = await sql`
    SELECT * FROM records ORDER BY data_registro ASC, created_at ASC
  `;

  const dbFormatted = {
    version: 2,
    provider: 'Neon PostgreSQL',
    updatedAt: new Date().toISOString(),
    records: {}
  };

  rows.forEach(r => {
    const d = r.data_registro;
    if (!dbFormatted.records[d]) dbFormatted.records[d] = [];
    dbFormatted.records[d].push(mapRow(r));
  });

  return dbFormatted;
}

module.exports = {
  initDB,
  getAllDates,
  getDayRecords,
  addRecord,
  updateRecord,
  deleteRecord,
  manualRollover,
  getSummary,
  getPreviousDate,
  getOffsetDate,
  exportFullDB
};
