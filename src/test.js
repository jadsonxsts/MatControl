require('dotenv').config();
const storage = require('./storage');

async function testNeon() {
  console.log('🧪 Testando operações completas no Neon PostgreSQL...');

  const day1 = '2026-09-01';
  const day2 = '2026-09-02';

  // 1. Limpar testes anteriores
  await storage.initDB();

  // 2. Inserir máquina carregada e não carregada
  const m1 = await storage.addRecord(day1, {
    maq: 'TORNO CNC 01',
    mat: 'Aço 1045',
    tipoMat: 'Melhorada',
    diam: '50mm',
    loc: 'Galpão A',
    obs: 'Usinagem concluída',
    tirada: true,
    encostada: true,
    carregada: true
  });

  const m2 = await storage.addRecord(day1, {
    maq: 'FRESA 02',
    mat: 'Alumínio 6061',
    tipoMat: 'Melhorada+',
    diam: '30mm',
    loc: 'Galpão B',
    obs: 'Ficou encostada na máquina',
    tirada: true,
    encostada: true,
    carregada: false // NÃO CARREGADA
  });

  console.log('✅ Registros criados no Neon com sucesso:', { m1: m1.maq, m2: m2.maq });

  // 3. Acessar dia 2 (deve trazer automaticamente a FRESA 02)
  const day2Data = await storage.getDayRecords(day2, true);
  console.log(`✅ Dia 2 carregado do Neon. Total de registros: ${day2Data.records.length}`);

  const inherited = day2Data.records.find(r => r.maq === 'FRESA 02');
  if (inherited) {
    console.log('🎉 Transição automática confirmada no Neon! Registro:', inherited);
  } else {
    console.error('❌ Falha na transição');
    process.exit(1);
  }

  const summary = await storage.getSummary(day2);
  console.log('✅ Resumo estatístico do Neon:', summary);

  console.log('🚀 Todos os testes no Neon PostgreSQL passaram com 100% de sucesso!');
  process.exit(0);
}

testNeon().catch(err => {
  console.error('❌ Erro no teste:', err);
  process.exit(1);
});
