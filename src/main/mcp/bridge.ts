// Cầu nối MCP: app AI (Claude Desktop, Claude Code…) chạy tiến trình này và nói chuyện qua stdin/stdout theo chuẩn MCP.
// Cầu nối không đụng vào dữ liệu: mỗi lần AI gọi công cụ thì chuyển sang Budkin đang mở qua socket cục bộ, Budkin chưa mở
// thì mở nó chạy nền dưới khay. Danh sách công cụ có sẵn ngay trong cầu nối, nên mở app AI không kéo Budkin dậy theo.
// Không import gì dính tới Electron: chạy được bằng Node trần (ELECTRON_RUN_AS_NODE) lẫn trong tiến trình Electron.
import { spawn } from 'child_process'
import { createConnection, type Socket } from 'net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { lineReader, type RpcRequest, type RpcResponse } from './protocol'
import { SERVER_INSTRUCTIONS, SERVER_NAME, TOOLS, errorResult, toolAnnotations, type ToolName, type ToolResult } from './tools'

export interface BridgeOptions {
  socket: string
  /** Cách mở Budkin khi chưa chạy (null: không tự mở — bản đang phát triển, kiểm thử) */
  launch: { command: string; args: string[]; env: NodeJS.ProcessEnv } | null
  version: string
  /** Chờ Budkin mở xong tối đa bấy lâu */
  launchTimeoutMs?: number
}

const NOT_RUNNING = 'Budkin is not running. Ask the user to open the Budkin app, then try again.'
const NO_START = 'Budkin did not start in time. Ask the user to open the Budkin app, then try again.'
const CLOSED = 'Budkin closed before answering. Try again.'

function tryConnect(path: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = createConnection(path)
    s.once('connect', () => {
      s.off('error', reject)
      resolve(s)
    })
    s.once('error', reject)
  })
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Đường tới Budkin đang mở: kết nối khi cần, Budkin thoát rồi mở lại thì tự nối lại ở lời gọi sau */
export class BudkinLink {
  private socket: Socket | null = null
  private opening: Promise<Socket> | null = null
  private seq = 0
  private readonly pending = new Map<number, (r: ToolResult) => void>()

  constructor(private readonly opts: BridgeOptions) {}

  async call(tool: string, args: unknown, client?: string): Promise<ToolResult> {
    let socket: Socket
    try {
      socket = await this.connect()
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err))
    }
    const id = ++this.seq
    return new Promise((resolve) => {
      this.pending.set(id, resolve)
      socket.write(`${JSON.stringify({ id, tool, args, client } satisfies RpcRequest)}\n`)
    })
  }

  close(): void {
    this.socket?.destroy()
  }

  private connect(): Promise<Socket> {
    if (this.socket && !this.socket.destroyed) return Promise.resolve(this.socket)
    this.opening ??= this.open().finally(() => (this.opening = null))
    return this.opening
  }

  private async open(): Promise<Socket> {
    try {
      return this.adopt(await tryConnect(this.opts.socket))
    } catch {
      // Budkin chưa mở
    }
    const launch = this.opts.launch
    if (!launch) throw new Error(NOT_RUNNING)
    const child = spawn(launch.command, launch.args, { detached: true, stdio: 'ignore', env: launch.env })
    child.on('error', (err) => process.stderr.write(`budkin mcp: không mở được Budkin: ${err.message}\n`))
    child.unref()
    const deadline = Date.now() + (this.opts.launchTimeoutMs ?? 30_000)
    while (Date.now() < deadline) {
      await sleep(300)
      try {
        return this.adopt(await tryConnect(this.opts.socket))
      } catch {
        // Budkin đang khởi động
      }
    }
    throw new Error(NO_START)
  }

  private adopt(socket: Socket): Socket {
    this.socket = socket
    socket.on(
      'data',
      lineReader(
        (line) => {
          let msg: RpcResponse
          try {
            msg = JSON.parse(line) as RpcResponse
          } catch {
            socket.destroy()
            return
          }
          this.pending.get(msg.id)?.(msg.result)
          this.pending.delete(msg.id)
        },
        () => socket.destroy()
      )
    )
    socket.on('error', () => socket.destroy())
    socket.on('close', () => {
      if (this.socket === socket) this.socket = null
      for (const done of this.pending.values()) done(errorResult(CLOSED))
      this.pending.clear()
    })
    return socket
  }
}

/** Máy chủ MCP của cầu nối: liệt kê công cụ, kiểm tra tham số, chuyển lời gọi cho Budkin */
export function createBridgeServer(call: (tool: ToolName, args: unknown, client?: string) => Promise<ToolResult>, version: string): McpServer {
  const server = new McpServer({ name: SERVER_NAME, title: 'Budkin', version }, { instructions: SERVER_INSTRUCTIONS })
  for (const name of Object.keys(TOOLS) as ToolName[]) {
    const def = TOOLS[name]
    server.registerTool(
      name,
      { title: def.title, description: def.description, inputSchema: def.input, annotations: { title: def.title, ...toolAnnotations(name) } },
      // Tham số đã được kiểm tra theo inputSchema; Budkin kiểm tra lại lần nữa trước khi chạy
      ((args: unknown) => call(name, args, server.server.getClientVersion()?.name)) as never
    )
  }
  return server
}

export async function runBridge(opts: BridgeOptions): Promise<void> {
  const link = new BudkinLink(opts)
  const server = createBridgeServer((tool, args, client) => link.call(tool, args, client), opts.version)
  await server.connect(new StdioServerTransport())
  // App AI đóng kết nối (thoát, tắt máy chủ MCP): cầu nối thoát theo
  const exit = (): void => {
    link.close()
    process.exit(0)
  }
  process.stdin.once('end', exit)
  process.stdin.once('close', exit)
}
