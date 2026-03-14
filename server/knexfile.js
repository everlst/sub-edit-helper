import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

export default {
  client: 'better-sqlite3',
  connection: {
    filename: path.join(dataDir, 'sub-edit-helper.db'),
  },
  useNullAsDefault: true,
  migrations: {
    directory: path.join(__dirname, 'src', 'db', 'migrations'),
  },
};
