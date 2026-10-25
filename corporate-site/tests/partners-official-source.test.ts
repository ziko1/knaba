import {describe,it,expect} from 'vitest';
import {partners,partnerSource} from '../src/data/partners';

describe('KnaBa public partner identities grounded in official company page',()=>{
 it('lists only the three logos currently presented at knaba.de on 2026-10-25',()=>{
  expect(partnerSource.url).toBe('https://knaba.de/');
  expect(partnerSource.checkedOn).toBe('2026-10-25');
  expect(partners.map(p=>p.name)).toEqual([
   'HIT · Hanseatische Immobilien Treuhand','Stromkreis','Gewobag'
  ]);
 });
 it('uses local branded assets with meaningful alt labels and intrinsic sizes',()=>{
  expect(partners.every(p=>p.image.startsWith('/images/partners/')&&p.name.length>3&&p.width>0&&p.height>0)).toBe(true);
 });
});
