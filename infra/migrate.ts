import { Database } from '../apps/api/database.ts';
const db=new Database();await db.migrate();await db.close();console.log('001_init applied');
