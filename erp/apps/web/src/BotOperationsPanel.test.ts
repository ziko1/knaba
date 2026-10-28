import {describe,it,expect} from 'vitest';
import {canManageBotChannels,botOperationsLabel} from './BotOperationsPanel.tsx';
describe('bot administration entry uses explicit auth and real locale labels',()=>{
 it('does not expose setup to guests or unapproved developer identities',()=>{
  expect(canManageBotChannels({roles:['GUEST'],permissions:['bot.settings.manage']})).toBe(false);
  expect(canManageBotChannels({roles:['DEVELOPER_SUPPORT'],permissions:['integration.status']})).toBe(false);
  expect(canManageBotChannels({roles:['DEVELOPER_SUPPORT'],permissions:['bot.settings.manage']})).toBe(true);
  expect(canManageBotChannels({roles:['OWNER'],permissions:['bot.settings.manage']})).toBe(true);
 });
 it('labels all published workspaces without using placeholders',()=>{
  expect(botOperationsLabel('DE')).toBe('Bot-Zentrale');
  expect(botOperationsLabel('UK')).toBe('Керування ботами');
  expect(botOperationsLabel('RU')).toBe('Управление ботами');
  expect(botOperationsLabel('EN')).toBe('Bot controls');
  for(const lang of ['PL','LT'] as const)expect(botOperationsLabel(lang).length).toBeGreaterThan(8);
 });
});
