import { describe, expect, it } from 'vitest';
import { studioAgentProxyTarget } from './proxy';
describe('local standalone service target',()=>{
 it('keeps embedded mode by default and normalizes loopback',()=>{expect(studioAgentProxyTarget(undefined)).toBeUndefined();expect(studioAgentProxyTarget('http://127.0.0.1:5198/')).toBe('http://127.0.0.1:5198');});
 it('rejects external hosts, userinfo and route injection',()=>{for(const value of ['https://example.com:443','http://evil.test:5198','http://user:pass@localhost:5198','http://localhost:5198/api','http://localhost:5198/?x=1','http://localhost:5198/#x'])expect(()=>studioAgentProxyTarget(value)).toThrow();});
});
