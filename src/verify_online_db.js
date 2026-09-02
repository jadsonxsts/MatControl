require('dotenv').config();
const { sql, initDB } = require('./db');
const storage = require('./storage');

async function runCompleteVerification() {
  console.log('===========================================================');
  console.log('🔍 INICIANDO DIAGNÓSTICO COMPLETO DO BANCO NEON POSTGRES');
  console.log('===========================================================');

  // 1. TESTE DE CONEXÃO ONLINE
  console.log('\n📡 [1/5] Testando conexão com o servidor Neon na nuvem...');
  const startTime = Date.now();
  try {
    const ping = await sql`SELECT NOW() as server_time, current_database() as db_name, version() as pg_version`;
    const latency = Date.now() - startTime;
    console.log(`✅ Conexão bem-sucedida!`);
    console.log(`   - Banco Conectado: ${ping[0].db_name}`);
    console.log(`   - Horário no Servidor: ${ping[0].server_time}`);
    console.log(`   - Latência: ${latency}ms`);
    console.log(`   - Versão Postgres: ${ping[0].pg_version.split(' ')[0]} ${ping[0].pg_version.split(' ')[1]}`);
  } catch (err) {
    console.error('❌ FALHA na conexão com o banco Neon:', err.message);
    process.exit(1);
  }

  // 2. TESTE DE ADICIONAR (CREATE)
  console.log('\n➕ [2/5] Testando ADICIONAR nova máquina no banco...');
  const testDate = '2026-09-02';
  let createdRecord;
  try {
    createdRecord = await storage.addRecord(testDate, {
      maq: 'TORNO CNC TESTE-01',
      mat: 'Aço Inox 316L',
      tipoMat: 'Melhorada+',
      diam: 'Ø 65mm',
      loc: 'Galpão Principal - Setor 3',
      obs: 'Registro de teste de verificação',
      tirada: true,
      encostada: false,
      carregada: false
    });

    console.log('✅ Máquina adicionada com sucesso no Neon!');
    console.log('   - ID gerado:', createdRecord.id);
    console.log('   - MAQ:', createdRecord.maq);
    console.log('   - Tipo:', createdRecord.tipoMat);
    console.log('   - Status:', { tirada: createdRecord.tirada, encostada: createdRecord.encostada, carregada: createdRecord.carregada });
  } catch (err) {
    console.error('❌ FALHA ao adicionar máquina:', err.message);
    process.exit(1);
  }

  // 3. TESTE DE CONSULTA (READ)
  console.log('\n🔎 [3/5] Testando CONSULTAR registros do dia...');
  try {
    const dayData = await storage.getDayRecords(testDate, false);
    const found = dayData.records.find(r => r.id === createdRecord.id);
    if (!found) {
      throw new Error('Registro recém-criado não foi localizado na consulta.');
    }
    console.log(`✅ Consulta OK! Encontrados ${dayData.records.length} registros para o dia ${testDate}.`);
    console.log('   - Dados validados:', { id: found.id, maq: found.maq, mat: found.mat, tipo: found.tipoMat });
  } catch (err) {
    console.error('❌ FALHA na consulta:', err.message);
    process.exit(1);
  }

  // 4. TESTE DE EDITAR (UPDATE)
  console.log('\n✏️ [4/5] Testando EDITAR campos e status da máquina...');
  try {
    const updatedRecord = await storage.updateRecord(testDate, createdRecord.id, {
      maq: 'TORNO CNC TESTE-01 (EDITADO)',
      mat: 'Aço Ferramenta D2',
      tipoMat: 'Melhorada',
      diam: 'Ø 80mm',
      loc: 'Bancada de Acabamento',
      obs: 'Observação atualizada com sucesso',
      tirada: true,
      encostada: true,
      carregada: true // Alterado para carregada!
    });

    console.log('✅ Edição persistida com sucesso no Neon!');
    console.log('   - Novo Nome (MAQ):', updatedRecord.maq);
    console.log('   - Novo Material:', updatedRecord.mat);
    console.log('   - Novo Tipo:', updatedRecord.tipoMat);
    console.log('   - Novo Status:', { tirada: updatedRecord.tirada, encostada: updatedRecord.encostada, carregada: updatedRecord.carregada });

    if (!updatedRecord.carregada || updatedRecord.maq !== 'TORNO CNC TESTE-01 (EDITADO)') {
      throw new Error('Os campos editados não correspondem aos dados salvos.');
    }
  } catch (err) {
    console.error('❌ FALHA ao editar máquina:', err.message);
    process.exit(1);
  }

  // 5. TESTE DE DELETAR (DELETE)
  console.log('\n🗑️ [5/5] Testando DELETAR a máquina do banco...');
  try {
    const deleteResult = await storage.deleteRecord(testDate, createdRecord.id);
    console.log('✅ Comando de exclusão executado no Neon:', deleteResult);

    // Verificar se realmente foi removido
    const checkAfterDelete = await sql`SELECT * FROM records WHERE id = ${createdRecord.id}`;
    if (checkAfterDelete.length === 0) {
      console.log('✅ Confirmação: Registro NÃO existe mais no banco de dados (exclusão 100% limpa).');
    } else {
      throw new Error('Registro ainda foi encontrado após a exclusão!');
    }
  } catch (err) {
    console.error('❌ FALHA ao deletar máquina:', err.message);
    process.exit(1);
  }

  console.log('\n===========================================================');
  console.log('🎉 RESULTADO: BANCO ONLINE E TODAS AS OPERAÇÕES 100% OK!');
  console.log('   - Conexão Online: ✅ ATIVA E RÁPIDA');
  console.log('   - Adicionar (Create): ✅ FUNCIONANDO');
  console.log('   - Consultar (Read): ✅ FUNCIONANDO');
  console.log('   - Editar (Update): ✅ FUNCIONANDO');
  console.log('   - Deletar (Delete): ✅ FUNCIONANDO');
  console.log('===========================================================');
  process.exit(0);
}

runCompleteVerification();
