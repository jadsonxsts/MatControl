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

// Helper para obter a data atual no formato YYYY-MM-DD no fuso local
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

// 2. Adicionar nova máquina/registro
app.post('/api/records', async (req, res) => {
  try {
    const { date, maq, mat, tipoMat, diam, loc, obs, tirada, encostada, carregada } = req.body;
    const targetDate = date || getTodayDateString();

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
    });

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

    const updated = await storage.updateRecord(targetDate, id, updates);
    const summary = await storage.getSummary(targetDate);

    res.json({ success: true, record: updated, summary });
  } catch (err) {
    console.error('Erro em PUT /api/records/:id:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// 4. Alternar status rápidos (tirada, encostada, carregada) com 1 clique
app.patch('/api/records/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, field, value } = req.body;
    const targetDate = date || getTodayDateString();

    if (!['tirada', 'encostada', 'carregada'].includes(field)) {
      return res.status(400).json({ success: false, error: 'Campo de status inválido.' });
    }

    // Se marcar como carregada = true, automaticamente marca tirada = true e encostada = true
    const updates = { [field]: Boolean(value) };
    if (field === 'carregada' && value) {
      updates.tirada = true;
      updates.encostada = true;
    } else if (field === 'encostada' && value) {
      updates.tirada = true;
    } else if (field === 'tirada' && !value) {
      // Se desmarcar tirada, remove encostada e carregada
      updates.encostada = false;
      updates.carregada = false;
    } else if (field === 'encostada' && !value) {
      updates.carregada = false;
    }

    const updated = await storage.updateRecord(targetDate, id, updates);
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

    await storage.deleteRecord(targetDate, id);
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
    if (!sourceDate || !targetDate) {
      return res.status(400).json({ success: false, error: 'Datas de origem e destino são obrigatórias.' });
    }

    const result = await storage.manualRollover(sourceDate, targetDate);
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

// 9. Exportar dia em CSV
app.get('/api/export/csv', async (req, res) => {
  try {
    const date = req.query.date || getTodayDateString();
    const data = await storage.getDayRecords(date, false);
    
    // Monta CSV no padrão Excel com separador ponto e vírgula
    let csv = '\uFEFF'; // BOM para suporte a acentos no Excel
    csv += 'MAQ;MAT;TIPO_MAT;DIAM;LOC;OBS;TIRADA;ENCOSTADA;CARREGADA;TRANSITADO_DE\n';

    data.records.forEach(r => {
      const escape = (str) => `"${(str || '').toString().replace(/"/g, '""')}"`;
      csv += `${escape(r.maq)};${escape(r.mat)};${escape(r.tipoMat || 'Melhorada')};${escape(r.diam)};${escape(r.loc)};${escape(r.obs)};${r.tirada ? 'SIM' : 'NÃO'};${r.encostada ? 'SIM' : 'NÃO'};${r.carregada ? 'SIM' : 'NÃO'};${escape(r.origemData || '')}\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="controle-materia-${date}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Iniciar com dados de exemplo (Seed inicial)
app.post('/api/seed', async (req, res) => {
  try {
    const today = getTodayDateString();
    const yesterday = storage.getPreviousDate(today);

    // Registros no dia de ontem
    await storage.addRecord(yesterday, {
      maq: 'TORNO CNC 01',
      mat: 'AÇO INOX 304',
      tipoMat: 'Melhorada+',
      diam: 'Ø 50mm',
      loc: 'GALPÃO A - SETOR 2',
      obs: 'Tudo concluído e carregado.',
      tirada: true,
      encostada: true,
      carregada: true
    });

    await storage.addRecord(yesterday, {
      maq: 'FRESA INDUSTRIAL 02',
      mat: 'ALUMÍNIO 6061-T6',
      tipoMat: 'Melhorada',
      diam: 'Ø 75mm',
      loc: 'GALPÃO B - BANCADA 4',
      obs: 'Matéria já está encostada na máquina, aguardando término de setup.',
      tirada: true,
      encostada: true,
      carregada: false
    });

    await storage.addRecord(yesterday, {
      maq: 'SERRA DE FITA 03',
      mat: 'AÇO 1045 TREFILADO',
      tipoMat: 'Melhorada+',
      diam: 'Ø 120mm',
      loc: 'ALMOXARIFADO CENTRAL',
      obs: 'Matéria foi tirada do almoxarifado, aguardando transporte.',
      tirada: true,
      encostada: false,
      carregada: false
    });

    // Ao chamar getDayRecords de hoje, ele automaticamente traz as 2 pendentes do dia anterior!
    const todayData = await storage.getDayRecords(today, true);

    res.json({
      success: true,
      message: 'Dados de demonstração inseridos no Neon Postgres com sucesso!',
      todayDate: today,
      yesterdayDate: yesterday,
      todayRecords: todayData.records
    });
  } catch (err) {
    console.error('Erro em POST /api/seed:', err);
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
