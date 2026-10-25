import {describe,it,expect} from 'vitest';
import {GET} from '../src/pages/api/catalogue.json';
import {parseCatalogue} from '../src/lib/planner';

describe('public construction catalogue does not market discontinued office cleaning',()=>{
  it('returns only the stable construction-cleaning offer and stays compatible with the planner',async()=>{
    const response=await GET({} as never) as Response;
    expect(response.status).toBe(200);
    const data=await response.json();
    expect(data.version).toBe(1);
    expect(data.services.map((item:{slug:string})=>item.slug)).toEqual(['baureinigung']);
    expect(JSON.stringify(data).toLowerCase()).not.toContain('büroreinigung');
    expect(()=>parseCatalogue(data)).not.toThrow();
  });
});
