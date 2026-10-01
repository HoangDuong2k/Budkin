// Điểm vào của cầu nối MCP ở chế độ Node: app AI chạy
//   ELECTRON_RUN_AS_NODE=1 <Budkin> <…>/out/main/mcp-bridge.js --data-dir <thư mục dữ liệu>
// (bản cài .deb, Windows, bản đang phát triển). Bản AppImage dùng `<Budkin.AppImage> --mcp-bridge` (xem index.ts).
import { basename } from 'path'
import { version } from '../../package.json'
import { HIDDEN_ARG } from '../shared/constants'
import { runBridge } from './mcp/bridge'
import { mcpSocketPath } from './mcp/protocol'

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}

const dataDir = argValue('--data-dir')
if (!dataDir) {
  process.stderr.write('budkin mcp: thiếu --data-dir\n')
  process.exit(2)
}

// Budkin mở từ cầu nối chạy bình thường (không phải chế độ Node), cùng thư mục dữ liệu
const env: NodeJS.ProcessEnv = { ...process.env, BUDKIN_USER_DATA: dataDir }
delete env.ELECTRON_RUN_AS_NODE
// Bản đang phát triển: execPath là electron trần, cần thêm đường dẫn mã nguồn (--app) mới mở được Budkin
const appPath = argValue('--app')
const bareElectron = /^electron(\.exe)?$/i.test(basename(process.execPath))
// (như npm run dev:linux, bản đang phát triển trên Linux chạy không sandbox — không có profile AppArmor của bản .deb)
const devArgs = appPath ? [appPath, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])] : []
const launch = process.argv.includes('--no-launch') || (bareElectron && !appPath) ? null : { command: process.execPath, args: [...devArgs, HIDDEN_ARG], env }

void runBridge({ socket: mcpSocketPath(dataDir), launch, version })
