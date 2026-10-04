import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.HANDOFF_VERIFY_ORIGIN ?? 'https://doc.opendesign.cc/connect';
const post = (path: string, data: unknown, extra: Record<string,string> = {}) => fetch(base + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(data),
});
const client = new Client({name:'opendesign-public-acceptance',version:'1.0.0'});
try {
 await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp')));
 const { tools } = await client.listTools();
 assert.deepEqual(tools.map(t=>t.name),['opendesign_create_document_handoff']);
 const html = await readFile(new URL('../docs/incoming/deepbrain-sample-report-9charts.html', import.meta.url), 'utf8');
 const result = await client.callTool({name:tools[0]!.name,arguments:{name:'MCP-public-9charts.html',html}});
 assert.notEqual(result.isError,true);
 const data = result.structuredContent as {status:string;open_url:string;expires_at:string};
 assert.equal(data.status,'ready');
 const url = new URL(data.open_url);
 assert.equal(url.origin,new URL(base).origin);
 assert.equal(url.pathname,new URL(base).pathname+"/open");
 const token = url.hash.slice(1);
 assert.equal((await post('/api/read',{token})).status,200);
 assert.equal((await (await post('/api/read',{token})).json()).html,html);
 assert.equal((await post('/api/handoffs',{name:'bad',html:'x'},{Origin:'https://evil.example'})).status,403);
 assert.equal((await post('/api/read',{token:'bad'})).status,404);
 assert.equal((await fetch(base+'/mcp')).status,405);
 const ttl = await post('/api/handoffs',{name:'TTL-synthetic.html',html:'<!doctype html><h1>TTL public acceptance</h1>'});
 assert.equal(ttl.status,201);
 const expiry = await ttl.json();
 // Private temporary artifact, never commit bearer links or echo them in server logs.
 await writeFile('/tmp/opendesign-mcp-public-qa.json',JSON.stringify({browser:data,expiry},null,2),{mode:0o600});
 console.log('PASS: initialize, listTools, callTool, exact 41770-byte report read, origin rejection, invalid token, GET 405.');
 console.log('Browser/TTL test links stored in /tmp/opendesign-mcp-public-qa.json');
 console.log('Expiry test due:',expiry.expires_at);
} finally { await client.close(); }
