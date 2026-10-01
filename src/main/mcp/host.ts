// Phía Budkin của kênh MCP: nghe trên socket cục bộ, mỗi dòng là một lời gọi công cụ từ cầu nối, trả kết quả theo id.
import { chmodSync, unlinkSync } from 'fs'
import { createConnection, createServer, type Server, type Socket } from 'net'
import { lineReader, type RpcRequest, type RpcResponse } from './protocol'
import { errorResult, type ToolResult } from './tools'

/** Có tiến trình nào đang nghe trên socket này không (socket cũ còn sót sau khi app bị tắt ngang thì không) */
function alive(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createConnection(path)
    s.once('connect', () => {
      s.destroy()
      resolve(true)
    })
    s.once('error', () => resolve(false))
  })
}

export class McpHost {
  private server: Server | null = null
  private readonly sockets = new Set<Socket>()

  constructor(
    readonly path: string,
    private readonly handle: (req: RpcRequest) => Promise<ToolResult>
  ) {}

  async start(): Promise<void> {
    try {
      await this.listen()
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE' || process.platform === 'win32' || (await alive(this.path))) throw err
      unlinkSync(this.path)
      await this.listen()
    }
    if (process.platform !== 'win32') chmodSync(this.path, 0o600)
  }

  private listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer((socket) => this.serve(socket))
      server.once('error', reject)
      server.listen(this.path, () => {
        server.off('error', reject)
        server.on('error', (err) => console.error('[mcp] socket', err))
        this.server = server
        resolve()
      })
    })
  }

  private serve(socket: Socket): void {
    this.sockets.add(socket)
    socket.on('close', () => this.sockets.delete(socket))
    socket.on('error', () => socket.destroy())
    socket.on(
      'data',
      lineReader(
        (line) => {
          let req: RpcRequest
          try {
            req = JSON.parse(line) as RpcRequest
          } catch {
            socket.destroy()
            return
          }
          if (typeof req?.id !== 'number' || typeof req.tool !== 'string') {
            socket.destroy()
            return
          }
          void this.handle(req)
            .catch((err: unknown) => errorResult(`Budkin error: ${err instanceof Error ? err.message : String(err)}`))
            .then((result) => {
              if (!socket.destroyed) socket.write(`${JSON.stringify({ id: req.id, result } satisfies RpcResponse)}\n`)
            })
        },
        () => socket.destroy()
      )
    )
  }

  stop(): void {
    for (const s of this.sockets) s.destroy()
    this.sockets.clear()
    this.server?.close()
    this.server = null
    if (process.platform !== 'win32') {
      try {
        unlinkSync(this.path)
      } catch {
        // Đã được xoá khi đóng
      }
    }
  }
}
