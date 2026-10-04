import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {loadServiceArea,verifyServiceArea} from './service-area';
vi.mock('node:fs',async importOriginal=>{
  const actual=await importOriginal<typeof import('node:fs')>();
  return {...actual,readFileSync:vi.fn(actual.readFileSync)};
});
it('rejects a modified or missing packaged artifact',()=>{
  vi.mocked(readFileSync).mockReturnValueOnce(Buffer.from('{"type":"MultiPolygon","coordinates":[]}'));
  expect(()=>loadServiceArea()).toThrow('Reviewed service area unavailable');
  vi.mocked(readFileSync).mockImplementationOnce(()=>{throw Error('ENOENT');});
  expect(()=>loadServiceArea()).toThrow('Reviewed service area unavailable');
});
it('cannot validate a route when evidence files are unavailable',async()=>{
  vi.mocked(readFileSync).mockImplementation(()=>{throw Error('ENOENT');});
  await expect(verifyServiceArea(undefined as never)).rejects.toMatchObject({code:'BOUNDARY_UNAVAILABLE'});
});
