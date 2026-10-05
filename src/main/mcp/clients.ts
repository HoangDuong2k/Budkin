// Gắn Budkin vào app AI trên máy: thêm máy chủ MCP "budkin" vào cấu hình của Claude Desktop (sửa file JSON, giữ nguyên
// phần còn lại) hoặc Claude Code (chạy `claude mcp add`). Không dùng Electron: test được bằng vitest.
import { execFile } from 'child_process'
import { copyFileSync, existsSync, readdirSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { delimiter, dirname, join } from 'path'
import type { AiClientState, McpLaunch } from '../../shared/api'
import { writeFileAtomicSync } from '../fsutil'
import { SERVER_NAME } from './tools'

const CONFIG_FILE = 'claude_desktop_config.json'

interface Env {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  home: string
}

const here = (): Env => ({ platform: process.platform, env: process.env, home: homedir() })

// ---------- Claude Desktop ----------

/** Thư mục cấu hình của Claude Desktop có trên máy (null: chưa cài). Bản Windows từ Microsoft Store nằm trong Packages */
export function claudeDesktopDir(e: Env = here()): string | null {
  // Kiểm thử: thư mục giả thay cho Claude Desktop thật
  const override = e.env.BUDKIN_CLAUDE_DESKTOP_DIR
  if (override !== undefined) return override && existsSync(override) ? override : null
  const candidates: string[] = []
  if (e.platform === 'win32') {
    if (e.env.APPDATA) candidates.push(join(e.env.APPDATA, 'Claude'))
    const packages = e.env.LOCALAPPDATA ? join(e.env.LOCALAPPDATA, 'Packages') : null
    if (packages && existsSync(packages)) {
      for (const name of readdirSync(packages)) if (/claude/i.test(name)) candidates.push(join(packages, name, 'LocalCache', 'Roaming', 'Claude'))
    }
  } else if (e.platform === 'darwin') candidates.push(join(e.home, 'Library', 'Application Support', 'Claude'))
  else candidates.push(join(e.env.XDG_CONFIG_HOME || join(e.home, '.config'), 'Claude'))
  return candidates.find((d) => existsSync(d)) ?? null
}

type ServerEntry = { command?: unknown; args?: unknown; env?: unknown; type?: unknown }

function readJson(file: string): Record<string, unknown> | null {
  if (!existsSync(file)) return null
  const text = readFileSync(file, 'utf8').replace(/^﻿/, '')
  if (!text.trim()) return {}
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${file} không phải một đối tượng JSON`)
  return value as Record<string, unknown>
}

function entryState(entry: ServerEntry | undefined, launch: McpLaunch): AiClientState {
  if (!entry) return 'available'
  const same =
    entry.command === launch.command &&
    JSON.stringify(entry.args ?? []) === JSON.stringify(launch.args) &&
    JSON.stringify(entry.env ?? {}) === JSON.stringify(launch.env ?? {})
  return same ? 'connected' : 'outdated'
}

function serverEntry(config: Record<string, unknown> | null): ServerEntry | undefined {
  const servers = config?.mcpServers
  if (!servers || typeof servers !== 'object') return undefined
  return (servers as Record<string, ServerEntry>)[SERVER_NAME]
}

export function desktopState(launch: McpLaunch, e: Env = here()): { state: AiClientState; configPath: string | null } {
  const dir = claudeDesktopDir(e)
  if (!dir) return { state: 'missing', configPath: null }
  const configPath = join(dir, CONFIG_FILE)
  try {
    return { state: entryState(serverEntry(readJson(configPath)), launch), configPath }
  } catch {
    // File cấu hình hỏng: coi như chưa kết nối (bấm Kết nối sẽ báo lỗi, không ghi đè)
    return { state: 'available', configPath }
  }
}

/** Thêm / cập nhật mục "budkin" trong mcpServers, giữ nguyên mọi thứ khác. Lần đầu sửa thì giữ một bản sao của file gốc */
export function connectDesktop(launch: McpLaunch, e: Env = here()): string {
  const dir = claudeDesktopDir(e)
  if (!dir) throw new Error('Claude Desktop chưa được cài trên máy này')
  const file = join(dir, CONFIG_FILE)
  let config: Record<string, unknown>
  try {
    config = readJson(file) ?? {}
  } catch (err) {
    throw new Error(`Không đọc được ${file}: ${err instanceof Error ? err.message : String(err)}`)
  }
  const backup = `${file}.before-budkin`
  if (existsSync(file) && !existsSync(backup)) copyFileSync(file, backup)
  const servers = config.mcpServers && typeof config.mcpServers === 'object' && !Array.isArray(config.mcpServers) ? (config.mcpServers as Record<string, unknown>) : {}
  const entry: Record<string, unknown> = { command: launch.command, args: launch.args }
  if (launch.env) entry.env = launch.env
  config.mcpServers = { ...servers, [SERVER_NAME]: entry }
  writeFileAtomicSync(file, `${JSON.stringify(config, null, 2)}\n`)
  return file
}

// ---------- Claude Code ----------

/** Tìm lệnh claude: theo PATH rồi các chỗ bộ cài hay đặt (app mở từ menu có PATH ngắn hơn terminal) */
export function findClaudeCli(e: Env = here()): string | null {
  // Kiểm thử: lệnh claude giả ('' = coi như không có)
  const override = e.env.BUDKIN_CLAUDE_CLI
  if (override !== undefined) return override && existsSync(override) ? override : null
  const win = e.platform === 'win32'
  const names = win ? ['claude.exe', 'claude.cmd'] : ['claude']
  const dirs = (e.env.PATH ?? e.env.Path ?? '').split(win ? ';' : delimiter).filter(Boolean)
  dirs.push(join(e.home, '.local', 'bin'), join(e.home, '.claude', 'local'))
  if (win && e.env.APPDATA) dirs.push(join(e.env.APPDATA, 'npm'))
  if (!win) dirs.push(join(e.home, '.npm-global', 'bin'), '/usr/local/bin', '/opt/homebrew/bin')
  for (const dir of dirs) for (const name of names) if (existsSync(join(dir, name))) return join(dir, name)
  return null
}

/** Cấu hình người dùng của Claude Code (máy chủ MCP phạm vi "user" nằm ở mcpServers) */
function claudeCodeConfig(e: Env): string {
  return join(e.env.CLAUDE_CONFIG_DIR || e.home, '.claude.json')
}

export function codeState(launch: McpLaunch, e: Env = here()): { state: AiClientState; cli: string | null; command: string } {
  const cli = findClaudeCli(e)
  const command = claudeCodeCommand(launch, e.platform)
  let state: AiClientState = cli ? 'available' : 'missing'
  try {
    const entry = serverEntry(readJson(claudeCodeConfig(e)))
    if (entry) state = entryState(entry, launch)
  } catch {
    // ~/.claude.json đang được Claude Code ghi dở / hỏng: coi như chưa biết
  }
  return { state, cli, command }
}

function quote(arg: string, platform: NodeJS.Platform): string {
  if (/^[\w@%+=:,./-]+$/.test(arg)) return arg
  return platform === 'win32' ? `"${arg}"` : `'${arg.replace(/'/g, `'\\''`)}'`
}

function addArgs(launch: McpLaunch): string[] {
  const env = Object.entries(launch.env ?? {}).flatMap(([k, v]) => ['-e', `${k}=${v}`])
  return ['mcp', 'add', SERVER_NAME, '--scope', 'user', ...env, '--', launch.command, ...launch.args]
}

/** Lệnh cho người dùng tự chép vào terminal */
export function claudeCodeCommand(launch: McpLaunch, platform: NodeJS.Platform = process.platform): string {
  return ['claude', ...addArgs(launch)].map((a) => quote(a, platform)).join(' ')
}

/**
 * PATH khi chạy lệnh claude: thêm thư mục chứa chính lệnh đó và các chỗ Homebrew / bộ cài hay đặt. App mở từ Dock (macOS)
 * hay menu ứng dụng chỉ có PATH tối thiểu, mà claude cài qua npm là script `#!/usr/bin/env node` — thiếu node trong PATH
 * thì không chạy được.
 */
export function cliPath(cli: string, e: Env = here()): string {
  const dirs = [dirname(cli), ...(e.env.PATH ?? '').split(delimiter), '/opt/homebrew/bin', '/usr/local/bin', join(e.home, '.local', 'bin')]
  return [...new Set(dirs.filter(Boolean))].join(delimiter)
}

function runCli(cli: string, args: string[], e: Env): Promise<void> {
  // claude.cmd (cài qua npm trên Windows) phải chạy qua cmd.exe
  const viaCmd = /\.cmd$/i.test(cli)
  const file = viaCmd ? (process.env.ComSpec ?? 'cmd.exe') : cli
  const argv = viaCmd ? ['/d', '/s', '/c', `"${[cli, ...args].map((a) => `"${a}"`).join(' ')}"`] : args
  const env = e.platform === 'win32' ? e.env : { ...e.env, PATH: cliPath(cli, e) }
  return new Promise((resolve, reject) => {
    execFile(file, argv, { timeout: 30_000, windowsHide: true, windowsVerbatimArguments: viaCmd, env }, (err, _stdout, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim().slice(0, 400)))
      else resolve()
    })
  })
}

/** Thêm Budkin vào Claude Code (phạm vi user: dùng được ở mọi thư mục). Đã có mục cũ thì gỡ rồi thêm lại */
export async function connectCode(launch: McpLaunch, e: Env = here()): Promise<void> {
  const cli = findClaudeCli(e)
  if (!cli) throw new Error('Không tìm thấy lệnh claude')
  if (codeState(launch, e).state !== 'available') await runCli(cli, ['mcp', 'remove', SERVER_NAME, '--scope', 'user'], e).catch(() => undefined)
  await runCli(cli, addArgs(launch), e)
}
