# 🏭 Sistema de Controle de Matéria & Máquinas

Sistema simples, leve e com armazenamento local em **JSON** para gerenciar o controle diário de matéria-prima e status de carregamento de máquinas industriais.

---

## 📋 Estrutura da Tabela de Máquinas

Cada linha da tabela representa uma máquina com as seguintes informações:

| Coluna | Significado | Descrição |
| :--- | :--- | :--- |
| **STATUS / CHECK** | **Carregada** | Interruptor rápido (`SIM` / `NÃO`). Se desmarcada, indica pendência. |
| **MAQ** | **Máquina** | Identificação/Nome da máquina (ex: `TORNO CNC 01`, `FRESA 03`). |
| **MAT** | **Matéria** | Tipo de matéria-prima (ex: `Aço Inox 304`, `Alumínio 6061`). |
| **DIAM** | **Diâmetro** | Dimensão do diâmetro (ex: `Ø 50mm`, `2 pol`, `12.5mm`). |
| **LOC** | **Localização** | Setor, galpão ou bancada (ex: `Galpão A - Setor 2`). |
| **OBS** | **Observações** | Detalhes de prioridade, operador ou notas de processo. |

---

## ⚡ Regra de Transição Automática (Rollover)

- **Máquinas Carregadas (`SIM`)**: Concluídas no dia.
- **Máquinas Não Carregadas (`NÃO`)**: Automaticamente transitam para o dia seguinte como pendências ao abrir ou navegar para uma nova data.
- Todas as máquinas transitadas exibem um **badge visual** com a data de origem.
- Botão **"Puxar Pendências"** permite sincronizar ou repassar pendências a qualquer momento.

---

## 💾 Armazenamento em JSON

Os dados são gravados localmente no arquivo:
```
controle-materia/data/database.json
```
- Leitura e escrita atômica para integridade dos dados.
- Histórico completo organizado por datas (`YYYY-MM-DD`).
- Backup completo em JSON ou exportação para **Excel/CSV** com 1 clique.

---

## 🚀 Como Executar

1. Abra o terminal na pasta do projeto:
   ```bash
   cd controle-materia
   ```

2. Inicie o servidor:
   ```bash
   npm start
   ```

3. Acesse no navegador:
   ```
   http://localhost:3000
   ```

---

## 🛠️ Tecnologias Utilizadas

- **Node.js** + **Express**
- **JSON Local Database** (`fs` com escrita atômica)
- **Tailwind CSS** + **Lucide Icons**
- **Vanilla JavaScript (SPA)** sem necessidade de build complexo.
