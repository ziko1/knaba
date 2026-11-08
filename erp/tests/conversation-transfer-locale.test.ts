import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import GuestConversationTransfer from '../apps/web/src/GuestConversationTransfer.tsx';
import type {Language} from '../packages/i18n/index.ts';

const expected:Record<Language,{heading:string;refresh:string;offline:string}>={
 DE:{heading:'Auf WhatsApp fortsetzen',refresh:'Status prüfen',offline:'Stellen Sie die Internetverbindung wieder her, bevor Sie fortfahren.'},
 EN:{heading:'Continue in WhatsApp',refresh:'Check status',offline:'Reconnect to the internet before continuing.'},
 PL:{heading:'Kontynuuj w WhatsApp',refresh:'Sprawdź stan',offline:'Przywróć połączenie z internetem, aby kontynuować.'},
 LT:{heading:'Tęsti per WhatsApp',refresh:'Tikrinti būseną',offline:'Atkurkite interneto ryšį, kad galėtumėte tęsti.'},
 RU:{heading:'Продолжить в WhatsApp',refresh:'Проверить статус',offline:'Восстановите интернет-соединение, чтобы продолжить.'},
 UK:{heading:'Продовжити у WhatsApp',refresh:'Перевірити стан',offline:'Відновіть інтернет-з’єднання, щоб продовжити.'}
};

describe('actual guest transfer component follows the selected UI language',()=>{
 it.each(Object.keys(expected) as Language[])('renders its heading, action and offline state in %s',language=>{
  const html=renderToStaticMarkup(createElement(GuestConversationTransfer,{channelId:'synthetic-guest-channel',language,online:false}));
  expect(html).toContain(`>${expected[language].heading}</h3>`);
  expect(html).toContain(`>${expected[language].refresh}</button>`);
  expect(html).toContain(expected[language].offline);
  for(const other of Object.keys(expected) as Language[])if(other!==language)expect(html).not.toContain(expected[other].heading);
 });
});
