import {identityCommands} from '../../packages/domain/identity.ts';
import {operationsCommands} from '../../packages/domain/operations.ts';
import {commerceCommands} from '../../packages/domain/commerce.ts';
import {resourcesCommands} from '../../packages/domain/resources.ts';
import {communicationsCommands} from '../../packages/domain/communications.ts';
import {governanceCommands} from '../../packages/domain/governance.ts';
import {CommandRegistry} from '../../packages/domain/core.ts';
export const registry:CommandRegistry={...identityCommands,...operationsCommands,...commerceCommands,...resourcesCommands,...communicationsCommands,...governanceCommands};
