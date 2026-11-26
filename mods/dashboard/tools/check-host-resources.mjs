// Run against a downloaded official desktop artifact; never starts/logs in the app.
import { installedAgentExecutable } from '../compat/platform.mjs';
import { inspectHostArchive } from '../compat/launch-config.mjs';
import { loadSidecarSdk } from '../sidecars/panel/sdk.mjs';
import assert from 'node:assert/strict';
const binary=installedAgentExecutable();
const sdk=await loadSidecarSdk();
assert.equal(typeof sdk.SidecarApp,'function');
assert.equal(typeof sdk.Response,'function');
const host=process.env.AG_PULSE_APP_RESOURCES?await inspectHostArchive(process.env.AG_PULSE_APP_RESOURCES):null;
if(host){
  assert.equal(typeof host.version,'string');
  assert.ok(host.version.length>0);
}
console.log(JSON.stringify({
  platform:process.platform,
  arch:process.arch,
  hostBinaryFound:true,
  embeddedSdkLoaded:true,
  ...(host?{hostVersion:host.version,hostRequiresDebugFlag:host.requiresDebugFlag}:{}),
}));
