require('dotenv').config();
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
    criadoPor: r.criado_por || null,
    atualizadoPor: r.atualizado_por || null,
    tiradaPor: r.tirada_por || null,
    encostadaPor: r.encostada_por || null,
    carregadaPor: r.carregada_por || null,
    tiradaEm: r.tirada_em || null,
    encostadaEm: r.encostada_em || null,
    carregadaEm: r.carregada_em || null,
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

  // Busca itens que foram explicitamente deletados/descartados nesta data
  const dismissedRows = await sql`
    SELECT origem_id, maq FROM dismissed_rollovers 
    WHERE data_registro = ${targetDate}
  `;

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
    // 1. Verifica se já foi descartado/deletado pelo usuário nesta data
    const wasDismissed = dismissedRows.some(d => 
      (d.origem_id && d.origem_id === pending.id) ||
      (d.maq && d.maq.toUpperCase() === (pending.maq || '').toUpperCase())
    );
    if (wasDismissed) {
      continue;
    }

    // 2. Verifica se já existe na data atual
    const alreadyExists = currentRows.some(r => 
      (r.origem_id && r.origem_id === pending.id) ||
      (r.origem_data === prevDate && r.maq === pending.maq)
    );

    if (!alreadyExists) {
      await sql`
        INSERT INTO records (
          data_registro, maq, mat, tipo_mat, diam, loc, obs, 
          tirada, encostada, carregada, origem_id, origem_data, transferido,
          criado_por, atualizado_por, tirada_por, encostada_por,
          tirada_em, encostada_em
        ) VALUES (
          ${targetDate}, ${pending.maq}, ${pending.mat}, ${pending.tipo_mat || 'Melhorada'},
          ${pending.diam}, ${pending.loc}, ${pending.obs},
          ${Boolean(pending.tirada)}, ${Boolean(pending.encostada)}, FALSE,
          ${pending.id}, ${prevDate}, TRUE,
          ${pending.criado_por || 'SISTEMA'}, ${pending.atualizado_por || 'SISTEMA'},
          ${pending.tirada_por || null}, ${pending.encostada_por || null},
          ${pending.tirada_em || null}, ${pending.encostada_em || null}
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
async function manualRollover(sourceDate, targetDate, operatorCode = 'SISTEMA') {
  await initDB();

  // Ao puxar manualmente, limpa os descartados para permitir repuxar
  await sql`DELETE FROM dismissed_rollovers WHERE data_registro = ${targetDate}`;

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
          tirada, encostada, carregada, origem_id, origem_data, transferido,
          criado_por, atualizado_por, tirada_por, encostada_por,
          tirada_em, encostada_em
        ) VALUES (
          ${targetDate}, ${item.maq}, ${item.mat}, ${item.tipo_mat || 'Melhorada'},
          ${item.diam}, ${item.loc}, ${item.obs},
          ${Boolean(item.tirada)}, ${Boolean(item.encostada)}, FALSE,
          ${item.id}, ${sourceDate}, TRUE,
          ${operatorCode}, ${operatorCode},
          ${item.tirada_por || null}, ${item.encostada_por || null},
          ${item.tirada_em || null}, ${item.encostada_em || null}
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
 * Adiciona um novo registro no banco Neon com código do operador
 */
async function addRecord(dateStr, data, operatorCode = 'ANÔNIMO') {
  await initDB();

  const op = (operatorCode || 'ANÔNIMO').trim().toUpperCase();

  const rows = await sql`
    INSERT INTO records (
      data_registro, maq, mat, tipo_mat, diam, loc, obs,
      tirada, encostada, carregada, origem_id, origem_data, transferido,
      criado_por, atualizado_por,
      tirada_por, encostada_por, carregada_por,
      tirada_em, encostada_em, carregada_em
    ) VALUES (
      ${dateStr}, ${(data.maq || '').trim()}, ${(data.mat || '').trim()},
      ${(data.tipoMat || 'Melhorada').trim()}, ${(data.diam || '').trim()},
      ${(data.loc || '').trim()}, ${(data.obs || '').trim()},
      ${Boolean(data.tirada)}, ${Boolean(data.encostada)}, ${Boolean(data.carregada)},
      ${data.origemId || null}, ${data.origemData || null}, ${Boolean(data.transferido)},
      ${op}, ${op},
      ${data.tirada ? op : null},
      ${data.encostada ? op : null},
      ${data.carregada ? op : null},
      ${data.tirada ? new Date() : null},
      ${data.encostada ? new Date() : null},
      ${data.carregada ? new Date() : null}
    )
    RETURNING *
  `;

  return mapRow(rows[0]);
}

/**
 * Atualiza um registro existente no banco Neon
 */
async function updateRecord(dateStr, id, updates, operatorCode = 'ANÔNIMO') {
  await initDB();

  const op = (operatorCode || 'ANÔNIMO').trim().toUpperCase();

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

  const tiradaPor = tirada ? (current.tirada ? current.tirada_por : op) : null;
  const tiradaEm = tirada ? (current.tirada ? current.tirada_em : new Date()) : null;

  const encostadaPor = encostada ? (current.encostada ? current.encostada_por : op) : null;
  const encostadaEm = encostada ? (current.encostada ? current.encostada_em : new Date()) : null;

  const carregadaPor = carregada ? (current.carregada ? current.carregada_por : op) : null;
  const carregadaEm = carregada ? (current.carregada ? current.carregada_em : new Date()) : null;

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
      tirada_por = ${tiradaPor},
      tirada_em = ${tiradaEm},
      encostada_por = ${encostadaPor},
      encostada_em = ${encostadaEm},
      carregada_por = ${carregadaPor},
      carregada_em = ${carregadaEm},
      atualizado_por = ${op},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;

  return mapRow(rows[0]);
}

/**
 * Alterna status individual (tirada, encostada, carregada) gravando o operador
 */
async function updateStatusStep(dateStr, id, field, value, operatorCode = 'ANÔNIMO') {
  await initDB();

  const op = (operatorCode || 'ANÔNIMO').trim().toUpperCase();

  const existing = await sql`SELECT * FROM records WHERE id = ${id}`;
  if (existing.length === 0) throw new Error('Registro não encontrado');
  const current = existing[0];

  let tirada = current.tirada;
  let encostada = current.encostada;
  let carregada = current.carregada;

  let tiradaPor = current.tirada_por;
  let tiradaEm = current.tirada_em;
  let encostadaPor = current.encostada_por;
  let encostadaEm = current.encostada_em;
  let carregadaPor = current.carregada_por;
  let carregadaEm = current.carregada_em;

  const boolVal = Boolean(value);

  if (field === 'carregada') {
    carregada = boolVal;
    if (boolVal) {
      carregadaPor = op;
      carregadaEm = new Date();
      tirada = true;
      if (!tiradaPor) { tiradaPor = op; tiradaEm = new Date(); }
      encostada = true;
      if (!encostadaPor) { encostadaPor = op; encostadaEm = new Date(); }
    } else {
      carregadaPor = null;
      carregadaEm = null;
    }
  } else if (field === 'encostada') {
    encostada = boolVal;
    if (boolVal) {
      encostadaPor = op;
      encostadaEm = new Date();
      tirada = true;
      if (!tiradaPor) { tiradaPor = op; tiradaEm = new Date(); }
    } else {
      encostadaPor = null;
      encostadaEm = null;
      carregada = false;
      carregadaPor = null;
      carregadaEm = null;
    }
  } else if (field === 'tirada') {
    tirada = boolVal;
    if (boolVal) {
      tiradaPor = op;
      tiradaEm = new Date();
    } else {
      tiradaPor = null;
      tiradaEm = null;
      encostada = false;
      encostadaPor = null;
      encostadaEm = null;
      carregada = false;
      carregadaPor = null;
      carregadaEm = null;
    }
  }

  const rows = await sql`
    UPDATE records 
    SET 
      tirada = ${tirada},
      encostada = ${encostada},
      carregada = ${carregada},
      tirada_por = ${tiradaPor},
      tirada_em = ${tiradaEm},
      encostada_por = ${encostadaPor},
      encostada_em = ${encostadaEm},
      carregada_por = ${carregadaPor},
      carregada_em = ${carregadaEm},
      atualizado_por = ${op},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;

  return mapRow(rows[0]);
}

/**
 * Remove um registro gravando na tabela de descartados para não reaparecer
 */
async function deleteRecord(dateStr, id, operatorCode = 'ANÔNIMO') {
  await initDB();

  const op = (operatorCode || 'ANÔNIMO').trim().toUpperCase();

  const existing = await sql`
    SELECT id, data_registro, maq, origem_id FROM records WHERE id = ${id}
  `;

  if (existing.length === 0) {
    throw new Error('Registro não encontrado para exclusão');
  }

  const item = existing[0];
  const targetOrigemId = item.origem_id || item.id;

  await sql`
    INSERT INTO dismissed_rollovers (data_registro, origem_id, maq)
    VALUES (${dateStr}, ${targetOrigemId}, ${item.maq})
  `;

  const rows = await sql`
    DELETE FROM records WHERE id = ${id} RETURNING id
  `;

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
    version: 3,
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
  updateStatusStep,
  deleteRecord,
  manualRollover,
  getSummary,
  getPreviousDate,
  getOffsetDate,
  exportFullDB
};
