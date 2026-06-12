import { execSync } from 'node:child_process'
import { arch, platform } from 'node:os'

function run(cmd) {
  console.log(`> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', shell: true })
}

// Fresh install so optional platform binaries resolve for the build OS (Render = linux).
run('npm install --workspaces --include=optional')

// npm lockfiles generated on Windows often skip Linux rollup/esbuild optional deps.
if (platform() === 'linux' && arch() === 'x64') {
  run(
    'npm install -w frontend @rollup/rollup-linux-x64-gnu @esbuild/linux-x64 --no-save'
  )
}

run('npm --workspace frontend run build')
