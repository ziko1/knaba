import { Client } from 'pg';
const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
try {await client.connect();const result=await client.query('SHOW server_version_num');if(Number(result.rows[0].server_version_num)<170006)throw new Error('POSTGRES_17_6_OR_NEWER_REQUIRED');await client.query('SELECT 1');console.log('PASSED: PostgreSQL connection and minimum version.');}
catch(error){console.error(`FAILED: ${error.message==='POSTGRES_17_6_OR_NEWER_REQUIRED'?error.message:'DATABASE_CONNECTION_CHECK'}`);process.exitCode=1;}finally{await client.end().catch(()=>{});}
