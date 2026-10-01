// Kênh giữa cầu nối MCP (tiến trình app AI chạy) và Budkin đang mở: socket cục bộ (Unix) hoặc named pipe (Windows),
// mỗi dòng một JSON. Chỉ người dùng hiện tại vào được: socket nằm trong thư mục dữ liệu, quyền 0600.
import { createHash } from 'crypto'
import { tmpdir } from 'os'
import { join } from 'path'
import { StringDecoder } from 'string_decoder'
import type { ToolResult } from './tools'

/** App AI chạy Budkin với tham số này: chỉ làm cầu nối MCP (bản AppImage — không chạy được ở chế độ Node) */
export const BRIDGE_ARG = '--mcp-bridge'

/** Đường dẫn socket theo thư mục dữ liệu: mỗi thư mục dữ liệu (bản cài, bản kiểm thử) một socket riêng */
export function mcpSocketPath(dataDir: string, platform: NodeJS.Platform = process.platform): string {
  const key = platform === 'win32' ? dataDir.toLowerCase() : dataDir
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 16)
  if (platform === 'win32') return `\\\\.\\pipe\\budkin-mcp-${hash}`
  const inside = join(dataDir, 'mcp.sock')
  // Đường dẫn socket Unix tối đa ~104–108 byte
  return Buffer.byteLength(inside) < 100 ? inside : join(tmpdir(), `budkin-mcp-${hash}.sock`)
}

/** Cầu nối → Budkin: gọi một công cụ. client: tên app AI (clientInfo.name trong MCP) */
export interface RpcRequest {
  id: number
  tool: string
  args: unknown
  client?: string
}

/** Budkin → cầu nối */
export interface RpcResponse {
  id: number
  result: ToolResult
}

/** Một dòng tối đa 4 MB: bên kia gửi rác thì cắt kết nối chứ không phình bộ nhớ */
const MAX_LINE = 4 * 1024 * 1024

/** Tách luồng byte thành từng dòng (chữ UTF-8 bị cắt giữa hai gói vẫn ghép đúng) */
export function lineReader(onLine: (line: string) => void, onOverflow: () => void): (chunk: Buffer) => void {
  const decoder = new StringDecoder('utf8')
  let buf = ''
  return (chunk) => {
    buf += decoder.write(chunk)
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line) onLine(line)
    }
    if (buf.length > MAX_LINE) {
      buf = ''
      onOverflow()
    }
  }
}
