import fs from 'fs'
import path from 'path'
import { execSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '..')

function venvDir() {
  return path.join(ROOT, '.venv')
}

export function venvPythonPath() {
  return process.platform === 'win32'
    ? path.join(venvDir(), 'Scripts', 'python.exe')
    : path.join(venvDir(), 'bin', 'python')
}

/** Prefer repo .venv (Render / PEP 668), else system python. */
export function resolvePythonExecutable() {
  const venv = venvPythonPath()
  if (fs.existsSync(venv)) return venv
  return process.platform === 'win32' ? 'python' : 'python3'
}

export function setupPythonVenv() {
  const python = process.platform === 'win32' ? 'python' : 'python3'
  const venv = venvDir()
  const venvBin = process.platform === 'win32' ? 'Scripts' : 'bin'

  if (!fs.existsSync(path.join(venv, venvBin))) {
    console.log('[python] creating venv...')
    execSync(`${python} -m venv .venv`, { cwd: ROOT, stdio: 'inherit', shell: true })
  }

  const pip =
    process.platform === 'win32'
      ? path.join(venv, 'Scripts', 'pip.exe')
      : path.join(venv, 'bin', 'pip')

  console.log('[python] installing requirements...')
  execSync(`"${pip}" install -r requirements.txt`, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  })
  console.log(`[python] ready: ${venvPythonPath()}`)
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) {
  setupPythonVenv()
}
