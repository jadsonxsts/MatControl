require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('⚠️ AVISO: DATABASE_URL não foi definida no .env.');
}

const sql = neon(connectionString);

/**
 * Criação automática da tabela no Neon Postgres
 */
async function initDB() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        data_registro VARCHAR(10) NOT NULL,
        maq VARCHAR(255) NOT NULL,
        mat VARCHAR(255),
        tipo_mat VARCHAR(50) DEFAULT 'Melhorada',
        diam VARCHAR(100),
        loc VARCHAR(255),
        obs TEXT,
        tirada BOOLEAN DEFAULT FALSE,
        encostada BOOLEAN DEFAULT FALSE,
        carregada BOOLEAN DEFAULT FALSE,
        origem_id UUID,
        origem_data VARCHAR(10),
        transferido BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_records_data ON records(data_registro);
    `;

    // Tabela para registrar itens deletados/descartados do rollover
    await sql`
      CREATE TABLE IF NOT EXISTS dismissed_rollovers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        data_registro VARCHAR(10) NOT NULL,
        origem_id UUID,
        maq VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_dismissed_data ON dismissed_rollovers(data_registro);
    `;

  } catch (err) {
    console.error('❌ Erro ao inicializar Neon:', err);
    throw err;
  }
}

module.exports = {
  sql,
  initDB
};
