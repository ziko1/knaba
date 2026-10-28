import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const service=readFileSync(new URL('./systemd/knaba-access-retention-audit.service',import.meta.url),'utf8');
const timer=readFileSync(new URL('./systemd/knaba-access-retention-audit.timer',import.meta.url),'utf8');
test('daily access retention timer calls audited read-only existing CLI, never deletes',()=>{
 assert.match(service,/^ExecStart=\/usr\/bin\/docker exec knaba-vps-internal node \/app\/vps\/manage\.mjs access-retention$/m);
 assert.doesNotMatch(service,/--apply|access-purge|rm\s+-rf|DELETE\s+FROM/i);
 assert.match(service,/^ConditionPathExists=\/srv\/knaba\/vps\/current\/vps\/access-retention\.mjs$/m);
 assert.match(service,/^TimeoutStartSec=90s$/m);
 assert.match(timer,/^OnCalendar=\*-\*-\* 03:40:00$/m);
 assert.match(timer,/^Persistent=true$/m);
 assert.match(timer,/^Unit=knaba-access-retention-audit\.service$/m);
});
