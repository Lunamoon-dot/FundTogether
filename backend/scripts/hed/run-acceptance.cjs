const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const backend = path.join(root, 'backend');
const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const run = (command, args, cwd = root) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`);
};
const wslPath = value => `/mnt/${value.slice(0, 1).toLowerCase()}${value.slice(2).replaceAll('\\', '/')}`;

if (process.platform === 'win32') run('wsl.exe', ['-d', 'Ubuntu-24.04', '--exec', 'sh', '-lc', `cd '${wslPath(path.join(root, 'contracts'))}' && forge test --match-contract HedFundingAndReservationTest`]);
else run('forge', ['test', '--match-contract', 'HedFundingAndReservationTest'], path.join(root, 'contracts'));
run(process.execPath, [npmCli, 'run', 'artifacts:hed'], backend);
run(process.execPath, ['--test', 'scripts/hed/artifact-contract.test.cjs', 'scripts/hed/local-rpc-endpoint.test.cjs'], backend);
run(process.execPath, [npmCli, 'run', 'build'], backend);
run(process.execPath, [npmCli, 'run', 'test:hed'], backend);
run(process.execPath, [npmCli, '--prefix', 'frontend', 'run', 'build'], root);
run(process.execPath, [npmCli, 'run', 'smoke:hed'], backend);
run(process.execPath, [npmCli, 'run', 'smoke:hed:reorg'], backend);
run(process.execPath, ['scripts/hed/acceptance-report.test.cjs'], backend);
console.log(JSON.stringify({ protocol: 'HED-MVP-1', status: 'local_acceptance_passed', host: os.hostname() }));
