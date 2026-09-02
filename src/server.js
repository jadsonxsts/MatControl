require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const storage = require('./storage');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Helper para obter código do operador da requisição
function getOperator(req) {
  return (req.headers['x-operator-code'] || req.body?.operatorCode || req.query?.operatorCode || 'ANÔNIMO').toString().trim().toUpperCase();
}

// Helper para data local
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 1. Obter registros de um dia específico
app.get('/api/records', async (req, res) => {
  try {
    const date = req.query.date || getTodayDateString();
    const data = await storage.getDayRecords(date);
    const summary = await storage.getSummary(date);
    const prevDate = storage.getPreviousDate(date);
    const prevData = await storage.getDayRecords(prevDate, false);

    res.json({
      success: true,
      date,
      records: data.records,
      summary,
      prevDate,
      prevRecordsCount: prevData.records.length,
      allDates: data.allDates
    });
  } catch (err) {
    console.error('Erro em GET /api/records:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Adicionar nova máquina/registro com código do operador
app.post('/api/records', async (req, res) => {
  try {
    const { date, maq, mat, tipoMat, diam, loc, obs, tirada, encostada, carregada } = req.body;
    const targetDate = date || getTodayDateString();
    const operator = getOperator(req);

    if (!maq || !maq.trim()) {
      return res.status(400).json({ success: false, error: 'O campo Máquina (MAQ) é obrigatório.' });
    }

    const created = await storage.addRecord(targetDate, {
      maq,
      mat,
      tipoMat: tipoMat || 'Melhorada',
      diam,
      loc,
      obs,
      tirada: !!tirada,
      encostada: !!encostada,
      carregada: !!carregada
    }, operator);

    const summary = await storage.getSummary(targetDate);
    res.status(201).json({ success: true, record: created, summary });
  } catch (err) {
    console.error('Erro em POST /api/records:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Atualizar uma máquina/registro
app.put('/api/records/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, ...updates } = req.body;
    const targetDate = date || getTodayDateString();
    const operator = getOperator(req);

    const updated = await storage.updateRecord(targetDate, id, updates, operator);
    const summary = await storage.getSummary(targetDate);

    res.json({ success: true, record: updated, summary });
  } catch (err) {
    console.error('Erro em PUT /api/records/:id:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// 4. Alternar status rápidos com gravação de operador (tirada, encostada, carregada)
app.patch('/api/records/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, field, value } = req.body;
    const targetDate = date || getTodayDateString();
    const operator = getOperator(req);

    if (!['tirada', 'encostada', 'carregada'].includes(field)) {
      return res.status(400).json({ success: false, error: 'Campo de status inválido.' });
    }

    const updated = await storage.updateStatusStep(targetDate, id, field, value, operator);
    const summary = await storage.getSummary(targetDate);

    res.json({ success: true, record: updated, summary });
  } catch (err) {
    console.error('Erro em PATCH /api/records/:id/status:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// 5. Excluir uma máquina/registro
app.delete('/api/records/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.query;
    const targetDate = date || getTodayDateString();
    const operator = getOperator(req);

    await storage.deleteRecord(targetDate, id, operator);
    const summary = await storage.getSummary(targetDate);

    res.json({ success: true, id, summary });
  } catch (err) {
    console.error('Erro em DELETE /api/records/:id:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// 6. Transferência manual (rollover) de pendências
app.post('/api/rollover', async (req, res) => {
  try {
    const { sourceDate, targetDate } = req.body;
    const operator = getOperator(req);

    if (!sourceDate || !targetDate) {
      return res.status(400).json({ success: false, error: 'Datas de origem e destino são obrigatórias.' });
    }

    const result = await storage.manualRollover(sourceDate, targetDate, operator);
    const summary = await storage.getSummary(targetDate);

    res.json({ success: true, ...result, summary });
  } catch (err) {
    console.error('Erro em POST /api/rollover:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Obter histórico resumido de todas as datas
app.get('/api/history', async (req, res) => {
  try {
    const dates = await storage.getAllDates();
    dates.reverse();
    const history = await Promise.all(dates.map(d => storage.getSummary(d)));
    res.json({ success: true, history });
  } catch (err) {
    console.error('Erro em GET /api/history:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Exportar banco completo em JSON
app.get('/api/export/json', async (req, res) => {
  try {
    const db = await storage.exportFullDB();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup-controle-materia-${getTodayDateString()}.json"`);
    res.send(JSON.stringify(db, null, 2));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Exportar dia em CSV com colunas de operadores
app.get('/api/export/csv', async (req, res) => {
  try {
    const date = req.query.date || getTodayDateString();
    const data = await storage.getDayRecords(date, false);
    
    let csv = '\uFEFF';
    csv += 'MAQ;MAT;TIPO_MAT;DIAM;LOC;OBS;TIRADA;TIRADA_POR;ENCOSTADA;ENCOSTADA_POR;CARREGADA;CARREGADA_POR;CRIADO_POR;ATUALIZADO_POR;TRANSITADO_DE\n';

    data.records.forEach(r => {
      const escape = (str) => `"${(str || '').toString().replace(/"/g, '""')}"`;
      csv += `${escape(r.maq)};${escape(r.mat)};${escape(r.tipoMat || 'Melhorada')};${escape(r.diam)};${escape(r.loc)};${escape(r.obs)};${r.tirada ? 'SIM' : 'NÃO'};${escape(r.tiradaPor || '')};${r.encostada ? 'SIM' : 'NÃO'};${escape(r.encostadaPor || '')};${r.carregada ? 'SIM' : 'NÃO'};${escape(r.carregadaPor || '')};${escape(r.criadoPor || '')};${escape(r.atualizadoPor || '')};${escape(r.origemData || '')}\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="controle-materia-${date}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Inicialização apenas se executado diretamente
if (require.main === module || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` 🚀 Sistema de Controle de Matéria e Máquinas`);
    console.log(` 🌐 Servidor rodando em: http://localhost:${PORT}`);
    console.log(` 🐘 Banco de Dados: Neon PostgreSQL (Nuvem Ativa)`);
    console.log(`====================================================`);
  });
}

module.exports = app;
