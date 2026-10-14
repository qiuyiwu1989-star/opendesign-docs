import {describe,it,expect,vi,afterEach} from 'vitest';
import {parseCloudWorkspace,cloudWrite} from './thinking-cloud';
afterEach(()=>vi.unstubAllGlobals());
import {createWork} from './thinking-workspace';
describe('cloud response validation',()=>{
 it('accepts empty account and valid saved workspace',()=>{expect(parseCloudWorkspace({revision:null,library:null}).library).toBeNull();const w=createWork();const library={version:2,activeWork:w.id,works:[w]};expect(parseCloudWorkspace({revision:'rev1',library}).library).toBe(library);});
 it('rejects broken revision provenance and invalid library before local replacement',()=>{expect(()=>parseCloudWorkspace({revision:null,library:{}})).toThrow();expect(()=>parseCloudWorkspace({revision:'rev1',library:null})).toThrow();expect(()=>parseCloudWorkspace({revision:'rev1',library:{version:2,works:[]}})).toThrow();});
});

it('sends only the revision passed by the loaded workspace and never retries a conflict',async()=>{
 const mocked=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'conflict',revision:'remote-new'}),{status:409}));vi.stubGlobal('fetch',mocked);
 const w=createWork();const library={version:2 as const,activeWork:w.id,works:[w]};
 await expect(cloudWrite(library,'loaded-old')).rejects.toMatchObject({status:409});
 expect(mocked).toHaveBeenCalledTimes(1);expect(JSON.parse(mocked.mock.calls[0]![1].body).expectedRevision).toBe('loaded-old');
});
